BYTEFEST Competition Backend v9 - Reports + Restart + Logical Questions

Changes from v8:
- Adds exceljs and polished teacher/judge Excel report export for Code Sprint, Bug Hunt and Checkmate.
- Adds POST /api/competition/admin/team/:event/:registrationId/restart.
  * Code Sprint: full individual restart.
  * Bug Hunt: full individual restart is allowed before start/during Round 1 because later rounds use one synchronized official timeline.
- Code Sprint question wording rewritten as logical missions; correct answers stay server-side.
- Circuit questions expose visual connection metadata only; final answers remain server-side.
- Bug Hunt question wording made more incident/diagnostic and less direct.

No MongoDB migration is required.
Render will install exceljs from package.json on redeploy.
