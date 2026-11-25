const objectSchema = (required, properties) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties
});

export const studyPackSchema = objectSchema(
  ["title", "summary", "keyTerms", "studyPlan", "flashcards", "quiz"],
  {
    title: {
      type: "string",
      description: "Punchy, authoritative topic or course title."
    },
    summary: {
      type: "string",
      description: "Strictly 2 short punchy sentences max (under 35 words total) covering what the topic is and the #1 exam focus."
    },
    keyTerms: {
      type: "array",
      description: "6 to 8 core terms.",
      items: objectSchema(["term", "definition"], {
        term: {
          type: "string",
          description: "Concise technical term name."
        },
        definition: {
          type: "string",
          description: "1 crisp, exam-ready sentence (max 22 words) explaining the term while naturally weaving in 3-4 exact grading keywords. No \"Meaning:\" prefix, no \"Keywords:\" tag, and no \"Example:\" sentence."
        }
      })
    },
    studyPlan: {
      type: "array",
      description: "Exactly 4 rapid exam-day rules or traps.",
      items: objectSchema(["step", "topic", "duration", "focus"], {
        step: {
          type: "string",
          description: "Short rule/trap label (e.g. \"Rule 1\", \"Trap 1\")."
        },
        topic: {
          type: "string",
          description: "Short title (2-4 words)."
        },
        duration: {
          type: "string",
          description: "Quick time, e.g. \"5 mins\" or \"Exam Day\"."
        },
        focus: {
          type: "string",
          description: "1 crisp sentence (max 15 words) highlighting exact keywords or common traps."
        }
      })
    },
    flashcards: {
      type: "array",
      description: "5 to 7 trigger flashcards.",
      items: objectSchema(["question", "answer"], {
        question: {
          type: "string",
          description: "Short trigger question (max 10 words)."
        },
        answer: {
          type: "string",
          description: "Keyword-packed answer (max 12 words)."
        }
      })
    },
    quiz: {
      type: "array",
      description: "Exactly 5 sharp multiple-choice questions.",
      items: objectSchema(["question", "options", "correctIndex", "explanation"], {
        question: {
          type: "string",
          description: "Short 1-sentence application stem."
        },
        options: {
          type: "array",
          description: "4 distinct answer choices.",
          items: { type: "string" }
        },
        correctIndex: {
          type: "integer",
          description: "0-indexed integer (0-3) for the correct option."
        },
        explanation: {
          type: "string",
          description: "1 concise sentence stating why the correct answer wins."
        }
      })
    }
  }
);

export const SYSTEM_INSTRUCTION = `You are Exam Sprint, an ultra-concise, high-intensity exam cram tutor.
Your mission is to generate a laser-focused, rapid-review cram pack that students can scan in under 60 seconds before an exam.
Enforce plain English, high density, and zero conversational filler.

### Operating Modes:
- Mode "topic": Synthesize the definitive university exam syllabus, foundational mechanics, core keywords, and common instructor exam traps directly for the requested topic.
- Mode "notes": Ground all extraction strictly in the supplied notes and materials as your source of truth.

### Strict Ultra-Brief Cram Architecture:

1. Executive Overview ("summary"):
- Strictly 2 short, punchy sentences max.
- Total length MUST be under 35 words.
- Sentence 1: Define exactly what the topic/subject is.
- Sentence 2: State the single #1 high-stakes exam focus or rule to memorize.

2. Key Concepts & Definitions ("keyTerms"):
- Provide 6 to 8 core terms.
- "term": Concise technical term name.
- "definition": 1 crisp, exam-ready sentence (max 22 words) that defines the concept while naturally embedding 3 to 4 key exam terms a grading rubric looks for.
- Never prefix with "Meaning:", never append a separate "Keywords:" section, and never add "Example:" sentences.

3. Rapid Exam Rules & Traps ("studyPlan"):
- Provide EXACTLY 4 high-yield exam-day rules or traps.
- "step": Rule label (e.g. "Rule 1", "Trap 1", "Rule 2", "Trap 2").
- "topic": Short title of 2 to 4 words (e.g. "2NF Composite Trap", "Working Set Boundary").
- "duration": e.g. "Exam Day", "5 mins".
- "focus": Strictly 1 crisp sentence of maximum 15 words highlighting exact keywords or common traps instructors test.

4. Trigger Flashcards ("flashcards"):
- Provide 5 to 7 rapid-fire active recall trigger cards.
- "question": Short trigger prompt of maximum 10 words.
- "answer": Keyword-packed answer of maximum 12 words.

5. Active Recall Quiz ("quiz"):
- Provide EXACTLY 5 sharp multiple-choice application questions.
- "question": Short 1-sentence question stem.
- "options": Exactly 4 clear options (1 correct, 3 plausible distractors).
- "correctIndex": Integer index (0, 1, 2, or 3) of the correct choice.
- "explanation": Exactly 1 concise sentence stating why the correct answer wins.

Strictly adhere to the JSON schema. Return only valid schema-conformant JSON.`;

export function buildUserPrompt({ course, topicContext, examDate, examType, pastedNotes, files = [], mode = "topic" }) {
  const isTopicMode = mode === "topic";
  const fileNames = files && files.length > 0
    ? files.map(file => file.originalname).filter(Boolean).join(", ")
    : "none";

  let prompt = isTopicMode
    ? `Generate an ultra-brief, high-yield exam cram pack for the following topic.

Topic: ${course}
${topicContext?.trim() ? `Context / Focus: ${topicContext.trim()}\n` : ""}Exam date: ${examDate || "not supplied"}
Exam format: ${examType || "Theory exam"}
Mode: Topic mode (synthesize the essential university exam syllabus, mechanics, keywords, and traps directly for this topic)

Formatting Constraints:
- Executive Overview (summary): Strictly 2 short punchy sentences max (under 35 words total) covering what the topic is and the #1 exam focus.
- Key Concepts (keyTerms): 6-8 items. Each definition must be 1 crisp sentence (max 22 words) naturally weaving in 3-4 key exam terms—no "Meaning:" label, no "Keywords:" label, and no "Example:" sentence.
- Study Plan (studyPlan): Exactly 4 rapid rules/traps. Short title (2-4 words) and 1 crisp sentence detail (max 15 words) on keywords or traps.
- Flashcards: Short trigger questions (max 10 words) with keyword-packed answers (max 12 words).
- Quiz: 5 sharp questions with 1-sentence stems and 1-sentence explanations naming why the answer wins.

Return only valid schema-conformant JSON.`
    : `Generate an ultra-brief, high-yield exam cram pack based strictly on the supplied course notes.

Course: ${course}
Exam date: ${examDate || "not supplied"}
Exam format: ${examType || "Theory exam"}
Attached files: ${fileNames}
Pasted notes: ${pastedNotes?.trim() ? "Provided below" : "none"}
Mode: Notes mode (ground all extraction strictly in the provided materials)

Formatting Constraints:
- Executive Overview (summary): Strictly 2 short punchy sentences max (under 35 words total) covering what the topic is and the #1 exam focus.
- Key Concepts (keyTerms): 6-8 items. Each definition must be 1 crisp sentence (max 22 words) naturally weaving in 3-4 key exam terms—no "Meaning:" label, no "Keywords:" label, and no "Example:" sentence.
- Study Plan (studyPlan): Exactly 4 rapid rules/traps. Short title (2-4 words) and 1 crisp sentence detail (max 15 words) on keywords or traps.
- Flashcards: Short trigger questions (max 10 words) with keyword-packed answers (max 12 words).
- Quiz: 5 sharp questions with 1-sentence stems and 1-sentence explanations naming why the answer wins.

Return only valid schema-conformant JSON.`;

  if (!isTopicMode && pastedNotes && pastedNotes.trim()) {
    prompt += `\n\n--- Pasted Notes ---\n${pastedNotes.trim()}`;
  }

  return prompt;
}