# Exam Sprint v1

This is the first functional core of Exam Sprint: a student supplies a course name and their own notes; the server sends the material to the AI API and returns a study pack based on that material.

## What is real now

- Course name, exam timeline and format are collected.
- Images, PDFs and text files are validated before processing.
- The server has a real API route designed for note-grounded study-pack creation.
- The browser clearly asks for permission before it transmits notes for processing.

## What still needs an owner-controlled account

To activate real processing, create a Gemini API key and add it as `GEMINI_API_KEY` in a private `.env` file. Do not place a key in `public/`, send it by chat, or commit it to Git.

Run locally with the bundled Node runtime:

```powershell
$nodePath = 'C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:GEMINI_API_KEY = 'your-key-here'
& $nodePath .\server.mjs
```

Then open `http://localhost:3000`.

## Deliberate limits for the first real test

- Up to 30 files per pack.
- Up to 8 MB per file.
- Student material is sent only after they confirm they have permission.
- The API request sets `store: false`; long-term deletion and full privacy policy still need to be designed before a broader launch.
