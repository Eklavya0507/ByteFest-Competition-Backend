BYTEFEST 2026 COMPETITION BACKEND - v8 FINAL QUESTIONS

What changed
============
1. config/codesprintQuestions.js replaced with the final selected Code Sprint bank.
   - Round 1 = 45 minutes, 3 stages
   - Round 2 = 45 minutes, 3 stages
   - Qualifier = 45 minutes
   - Semifinal = 35 minutes
   - Wildcard = 35 minutes
   - Entry Final = 25 minutes
   - Final Wildcard = 25 minutes
   - Grand Final = 60 minutes / four phases
   - Round 1/2 Stage 1 questions have no hints.
   - Other selected stages use at most one hint.

2. config/bughuntQuestions.js replaced with 14 final questions.
   - Round 1: 4 questions
   - Round 2: 4 questions
   - Round 3: 4 questions
   - Surprise: 1 question
   - Final: 1 question

3. Bug Hunt supports custom server-side validators for structured patch/debug answers.

4. Question APIs now send safe `ui` metadata to frontend.
   Correct answers / validators remain backend-only.

5. Checkmate backend/security is unchanged from v6 Checkmate Unlock.

Deploy
======
Use the EXISTING Render service.
Build command: npm install
Start command: npm start
Redeploy the latest commit after uploading this backend.

Existing environment variables remain the same, including:
MONGODB_URI
REGISTRATION_MONGODB_URI
ADMIN_SECRET
ADMIN_LOGIN_PASSWORD
CODESPRINT_SECRET
CODESPRINT_COORDINATOR_PASSWORD
BUGHUNT_SECRET
BUGHUNT_COORDINATOR_PASSWORD
FRONTEND_ORIGINS
CHECKMATE_SECRET (optional)
CHECKMATE_COORDINATOR_PASSWORD (optional; fallback supported)

No MongoDB migration is required for the question-bank update.
