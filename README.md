# BYTEFEST 2026 Competition Backend v2

One backend for Code Sprint and Bug Hunt. Participant accounts come from the existing registration MongoDB; the competition admin does not manually create teams.

## Important Render environment variable
Copy the exact `MONGODB_URI` from the existing registration backend into this service as `REGISTRATION_MONGODB_URI`. Keep this service's own `MONGODB_URI` pointed at the competition database.

Participant password: `FirstWordOfTeamName@Last5OfRegistrationID`. Example: `Code Warriors` + `BF26-A7C91D42` -> `Code@91D42`.

Bug Hunt schedule after Admin presses Start once: 35m Round 1 -> 40m Round 2 -> 50m Round 3 -> 20m Surprise -> automatic Top 3 -> 15m Final.
