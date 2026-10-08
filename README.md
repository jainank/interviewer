# Interview Studio

A dependency-free Node.js application that runs a structured 30-minute technical interview for any role and technology stack. Claude creates the question plan and scoring rubrics, assesses each transcribed answer, and produces a weighted recommendation report.

## Features

- Role, technology stack, and seniority-specific interview plans
- Seven to nine weighted, scenario-based questions sized for 30 minutes
- Browser speech-to-text with an editable transcript
- Per-answer rubric scoring, strengths, and gaps
- Deterministic weighted recommendation thresholds
- Printable question-by-question final report
- Anthropic API key remains on the server

## Run locally

Node.js 20 or newer is required. No package installation is needed.

1. Copy `.env.example` to `.env`.
2. Add an Anthropic API key to `ANTHROPIC_API_KEY`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

For speech recognition, use a current Chrome or Edge browser and allow microphone access. Typed answers work in every modern browser.

## Commands

```bash
npm start
npm run dev
npm test
```

## Scoring

Each generated question has a private rubric and a weight; weights total 100%. Claude gives each answer a score from 0 to 100. The overall score is the sum of each score multiplied by its question weight. Unanswered questions score zero.

| Weighted score | Recommendation |
| --- | --- |
| 75–100 | Move to next round |
| 60–74.9 | Human review recommended |
| Below 60 | Do not move forward |

If fewer than 60% of questions are answered, the result is **Insufficient evidence** regardless of score. The recommendation is decision support and should be reviewed by a human interviewer.

## Current persistence model

Interview sessions are held in server memory and are cleared when the process restarts. For production, replace the in-memory map in `server/interview.js` with a persistent database and add candidate authentication, retention controls, and explicit recording/transcription consent.
