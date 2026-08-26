# BYTEFEST Competition Backend

This is a NEW standalone backend repository for the BYTEFEST competition portal.

It does **not** modify or depend on the registration backend.

## One backend repo for all competition events
Use this same backend repository for:
- Code Sprint
- Bug Hunt (add later)
- Checkmate (add later)

## Code Sprint included now
- Team ID + generated password
- Round 1 / Round 2 / Qualifier
- Automatic stage and round progression
- Hints with penalties
- Ranking
- Parallel Semifinal + Wildcard Entry
- Entry Final / Final Wildcard / 3-team Grand Final
- Fullscreen security violation logging
- 4 coordinator unlocks, then next violation disqualifies
- Admin team creation/list/delete
- Projector leaderboard

## Change questions later
Edit only:

`config/codesprintQuestions.js`

Correct answers stay on the backend and are not sent to participant source code.

## Render setup
Create a NEW Render Web Service connected to this repository.

Build command:
`npm install`

Start command:
`npm start`

Copy `.env.example` keys into Render Environment.

Required:
- `MONGODB_URI`
- `ADMIN_SECRET`
- `ADMIN_LOGIN_PASSWORD`
- `CODESPRINT_SECRET`
- `CODESPRINT_COORDINATOR_PASSWORD`
- `FRONTEND_ORIGINS`

Use a separate competition database, for example:
`bytefest_competition`
