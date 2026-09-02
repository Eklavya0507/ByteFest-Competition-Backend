BYTEFEST 2026 COMPETITION BACKEND v10 - BUG HUNT RESET + ONE MORE CHANCE

FIXES
1. Fresh Bug Hunt reset endpoint:
   POST /api/competition/admin/bughunt/reset
   Body: {"confirm":"RESET BUG HUNT"}

   This deletes ONLY BugHuntTeam competition-state/test records and resets both
   BugHuntControl and EventControl back to NOT STARTED. Approved registrations in
   REGISTRATION_MONGODB_URI are NOT touched.

2. Disqualified Bug Hunt team ONE MORE CHANCE:
   Existing admin security action "resume" now restores a DQ team to the current
   official Bug Hunt phase while keeping its score/progress.

3. Root cause of old COMPLETED screen:
   BugHuntControl.startedAt from yesterday remained in MongoDB. phaseFrom() therefore
   calculated that the synchronized event timeline had already passed the Final.
   Completed/DQ team state also remained in BugHuntTeam. Use the new reset once before
   the real event, then START BUG HUNT.
