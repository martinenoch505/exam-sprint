import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { studyPackSchema, SYSTEM_INSTRUCTION, buildUserPrompt } from "./prompts.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envResult = dotenv.config({ path: path.join(here, ".env") });
if (envResult.error && envResult.error.code !== "ENOENT") console.warn("Could not load .env:", envResult.error.message);

const app = express();
const port = Number(process.env.PORT || 3000);
const maxFiles = 30;
const maxFileBytes = 8 * 1024 * 1024;
const maxPastedNotesChars = 50000;
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 8);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(value => value.trim()).filter(Boolean) : true;

if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(here, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: maxFiles, fileSize: maxFileBytes },
  fileFilter: (_req, file, callback) => callback(null, allowedMimeTypes.has(file.mimetype))
});

const rateBuckets = new Map();
let lastCleanup = Date.now();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (app.get("trust proxy") && typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function rateLimitStudyPack(req, res, next) {
  const now = Date.now();
  if (now - lastCleanup > rateLimitWindowMs) {
    for (const [ip, entry] of rateBuckets.entries()) {
      if (entry.resetAt <= now) rateBuckets.delete(ip);
    }
    lastCleanup = now;
  }

  const key = getClientIp(req);
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + rateLimitWindowMs };
    rateBuckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, rateLimitMax - bucket.count);
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  res.setHeader("X-RateLimit-Limit", String(rateLimitMax));
  res.setHeader("X-RateLimit-Remaining", String(remaining));

  if (bucket.count > rateLimitMax) {
    res.setHeader("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      error: `Too many study packs generated from this network. Wait ${Math.ceil(retryAfterSec / 60)} minute(s) and try again.`
    });
  }

  return next();
}

function apiError(status, message) { const error = new Error(message); error.status = status; return error; }
function hasOnly(value, keys) { return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function nonEmptyString(value) { return typeof value === "string" && value.trim().length > 0; }
function configuredGeminiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key && key !== "replace_with_your_key" ? key : null;
}

function isNetworkOrConnectError(error) {
  const code = String(error?.code || error?.cause?.code || "");
  const msg = String(error?.message || error?.cause?.message || "");
  return /UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(`${code} ${msg}`) ||
    /fetch failed|connect timeout|network error/i.test(msg);
}

function validateStudyPack(pack) {
  const validTerms = Array.isArray(pack?.keyTerms) && pack.keyTerms.every(item => hasOnly(item, ["term", "definition"]) && nonEmptyString(item.term) && nonEmptyString(item.definition));
  const validPlan = Array.isArray(pack?.studyPlan) && pack.studyPlan.every(item => hasOnly(item, ["step", "topic", "duration", "focus"]) && nonEmptyString(item.step) && nonEmptyString(item.topic) && nonEmptyString(item.duration) && nonEmptyString(item.focus));
  const validCards = Array.isArray(pack?.flashcards) && pack.flashcards.every(item => hasOnly(item, ["question", "answer"]) && nonEmptyString(item.question) && nonEmptyString(item.answer));
  const validQuiz = Array.isArray(pack?.quiz) && pack.quiz.every(item => hasOnly(item, ["question", "options", "correctIndex", "explanation"]) && nonEmptyString(item.question) && Array.isArray(item.options) && item.options.length >= 2 && item.options.every(nonEmptyString) && Number.isInteger(item.correctIndex) && item.correctIndex >= 0 && item.correctIndex < item.options.length && nonEmptyString(item.explanation));
  if (!hasOnly(pack, ["title", "summary", "keyTerms", "studyPlan", "flashcards", "quiz"]) || !nonEmptyString(pack.title) || !nonEmptyString(pack.summary) || !validTerms || !validPlan || !validCards || !validQuiz) throw apiError(502, "The AI returned an invalid study-pack format. Please try again.");
  return pack;
}

function isQuotaOrTransientError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || error?.cause?.status);
  return status === 429 || status === 503 || /(^|\D)(429|503)(\D|$)|resource[_ ]exhausted|quota|rate limit|high demand|unavailable/i.test(String(error?.message || ""));
}

async function generateWithModel(ai, model, contents) {
  return ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: studyPackSchema,
      temperature: 0.2
    }
  });
}

async function generateStudyPack(fields, files) {
  const apiKey = configuredGeminiKey();
  if (!apiKey) throw apiError(400, "Missing GEMINI_API_KEY in .env");

  const mode = fields?.mode === "notes" ? "notes" : "topic";
  const parts = [{ text: buildUserPrompt({ ...fields, files, mode }) }];
  if (mode === "notes") {
    for (const file of files) {
      if (file.mimetype === "text/plain") {
        parts.push({ text: `\n\nFile: ${file.originalname}\n${file.buffer.toString("utf8")}` });
      } else {
        parts.push({ inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimetype === "application/pdf" ? "application/pdf" : file.mimetype } });
      }
    }
  }

  const ai = new GoogleGenAI({ apiKey });
  const primaryModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-3.5-flash-lite";
  let response;
  try {
    response = await generateWithModel(ai, primaryModel, [{ role: "user", parts }]);
  } catch (error) {
    if (isNetworkOrConnectError(error)) {
      throw apiError(503, "Your internet connection appears to be off or timed out while reaching the AI service. Check your network and try again.");
    }
    if (!isQuotaOrTransientError(error) || fallbackModel === primaryModel) throw error;
    try {
      response = await generateWithModel(ai, fallbackModel, [{ role: "user", parts }]);
    } catch (fallbackError) {
      if (isNetworkOrConnectError(fallbackError)) {
        throw apiError(503, "Your internet connection appears to be off or timed out while reaching the AI service. Check your network and try again.");
      }
      if (isQuotaOrTransientError(fallbackError)) throw apiError(429, "AI capacity is temporarily busy. Please try again shortly.");
      throw fallbackError;
    }
  }

  const rawText = String(response?.text || "").trim();
  if (!rawText) throw apiError(502, "The AI did not return a study pack. Please try again.");
  const text = rawText.startsWith("```")
    ? rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    : rawText;
  try { return validateStudyPack(JSON.parse(text)); }
  catch (error) { if (error.status) throw error; throw apiError(502, "The AI returned unreadable study-pack data. Please try again."); }
}

function validateFields(body, files) {
  if (!body?.consent) throw apiError(400, "Confirm to generate this study pack.");
  const courseOrTopic = body?.course?.trim() || body?.topic?.trim() || "";
  const mode = body?.mode === "notes" ? "notes" : "topic";
  if (courseOrTopic.length < 2) {
    throw apiError(400, mode === "topic" ? "Enter a topic to study (at least 2 characters)." : "Enter your course name.");
  }
  if (!nonEmptyString(body.examType)) throw apiError(400, "Choose an exam type.");
  if (typeof body?.pastedNotes === "string" && body.pastedNotes.length > maxPastedNotesChars) {
    throw apiError(413, `Pasted notes are too long. Keep them under ${maxPastedNotesChars.toLocaleString()} characters.`);
  }
  if (mode === "notes" && !files?.length && !nonEmptyString(body.pastedNotes)) {
    throw apiError(400, "Add a note file or paste your notes.");
  }
}

app.post("/api/study-pack", rateLimitStudyPack, upload.array("files", maxFiles), async (req, res, next) => {
  const files = req.files || [];
  try {
    validateFields(req.body, files);
    res.json(await generateStudyPack(req.body, files));
  } catch (error) {
    next(error);
  } finally {
    // Multer memory storage creates no disk files. Clear buffer references immediately after the response path finishes.
    for (const file of files) file.buffer = Buffer.alloc(0);
  }
});
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Each file must be 8 MB or smaller." });
  if (error instanceof multer.MulterError) return res.status(400).json({ error: "Upload limit reached. Add up to 30 supported files." });
  if (error?.status) return res.status(error.status).json({ error: error.message });
  console.error(error); return res.status(500).json({ error: "Something unexpected happened. Please try again." });
});

app.listen(port, () => console.log(`Exam Sprint is running at http://localhost:${port}`));