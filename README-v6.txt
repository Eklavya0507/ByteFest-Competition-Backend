BYTEFEST Competition v6

Backend changes from v4:
- Checkmate shared digital-board move state is stored server-side.
- FEN, notation, from/to square and move history are stored.
- 8+3 clock is authoritative on the backend.
- Code Sprint/Bug Hunt admin manual LOCK/UNLOCK support was added.

v5:
- No backend change. It was a frontend Checkmate performance/layout update.

v6:
- Added Checkmate fullscreen/security violation backend.
- Running Checkmate pauses immediately on fullscreen/tab violation.
- Coordinator password is required to unlock the shared Checkmate station.
- Checkmate admin now shows SECURITY LOCKED/UNLOCKED and LOCK/UNLOCK control.
- Normal RESUME cannot bypass a security lock.
- CHECKMATE_COORDINATOR_PASSWORD is supported; Code Sprint coordinator password is the fallback.
