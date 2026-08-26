const express = require("express");
const CheckmateMatch = require("../models/CheckmateMatch");
const CheckmatePlayer = require("../models/CheckmatePlayer");
const EventControl = require("../models/EventControl");
const { requirePlayer } = require("../utils/checkmateAuth");
const {
    PIECE_VALUES,
    CAPTURE_LIMITS,
    clean,
    commitElapsed,
    checkTimeout,
    materialAdjudicationIfNeeded,
    finalizeMatch,
    publicMatch
} = require("../utils/checkmateService");

const router = express.Router();
const MAX_VIOLATIONS = 4;

async function eventControl() {
    return EventControl.findOneAndUpdate(
        { event: "Checkmate" },
        { $setOnInsert: { event: "Checkmate" } },
        { upsert: true, new: true }
    );
}

async function currentMatch(registrationId) {
    return CheckmateMatch.findOne({
        $or: [
            { whiteRegistrationId: registrationId },
            { blackRegistrationId: registrationId }
        ],
        status: { $in: ["waiting", "running", "paused"] }
    }).sort({ createdAt: -1 });
}

async function ensureRunningEvent() {
    const control = await eventControl();
    if (control.status === "not_started") {
        const error = new Error("Checkmate has not started yet");
        error.status = 409;
        throw error;
    }
    if (control.status === "paused") {
        const error = new Error("Checkmate is stopped by the coordinator");
        error.status = 423;
        throw error;
    }
    return control;
}

router.get("/state", requirePlayer, async (req, res) => {
    try {
        const player = req.checkmatePlayer;
        const control = await eventControl();
        let match = await currentMatch(player.registrationId);

        if (match && match.status === "running") {
            await checkTimeout(match);
            match = await CheckmateMatch.findById(match._id);
        }

        let publicData = null;
        let you = null;

        if (match) {
            const [whitePlayer, blackPlayer] = await Promise.all([
                CheckmatePlayer.findOne({ registrationId: match.whiteRegistrationId }),
                CheckmatePlayer.findOne({ registrationId: match.blackRegistrationId })
            ]);

            publicData = publicMatch(match, whitePlayer, blackPlayer);
            you = {
                color: match.whiteRegistrationId === player.registrationId ? "white" : "black"
            };
        }

        return res.json({
            eventControl: {
                status: control.status,
                startedAt: control.startedAt,
                pausedAt: control.pausedAt
            },
            player: {
                registrationId: player.registrationId,
                playerName: player.playerName,
                tournamentPoints: player.tournamentPoints,
                wins: player.wins,
                draws: player.draws,
                losses: player.losses,
                rank: player.rank,
                capturePoints: player.capturePoints,
                materialDifferential: Number(player.materialFor || 0) - Number(player.materialAgainst || 0)
            },
            match: publicData,
            security: match ? {
                violations: Number(match.security?.violations || 0),
                maxViolations: MAX_VIOLATIONS,
                locked: Boolean(match.security?.locked),
                lockReason: match.security?.lockReason || ""
            } : {
                violations: 0,
                maxViolations: MAX_VIOLATIONS,
                locked: false,
                lockReason: ""
            },
            you
        });
    } catch (error) {
        console.error("Checkmate state error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/move", requirePlayer, async (req, res) => {
    try {
        await ensureRunningEvent();

        const player = req.checkmatePlayer;
        let match = await currentMatch(player.registrationId);
        if (!match) return res.status(404).json({ message: "No active Checkmate match" });

        await checkTimeout(match);
        match = await CheckmateMatch.findById(match._id);

        if (match.security?.locked) {
            return res.status(423).json({
                message: "Checkmate station is security locked. Coordinator unlock required.",
                locked: true
            });
        }

        if (match.status !== "running") {
            return res.status(409).json({ message: match.status === "completed" ? "Match is already completed" : "Match is not running" });
        }

        const myColor = match.whiteRegistrationId === player.registrationId ? "white" : "black";
        if (match.activeColor !== myColor) return res.status(409).json({ message: "It is not your turn" });

        const capturedPiece = clean(req.body?.capturedPiece).toLowerCase();
        if (capturedPiece && !PIECE_VALUES[capturedPiece]) {
            return res.status(400).json({ message: "Invalid captured piece" });
        }
        const fen = clean(req.body?.fen);
        const notation = clean(req.body?.notation);
        const from = clean(req.body?.from).toLowerCase();
        const to = clean(req.body?.to).toLowerCase();
        const boardResult = clean(req.body?.boardResult).toLowerCase();
        const boardResultReason = clean(req.body?.boardResultReason);
        if (fen && fen.length > 200) return res.status(400).json({ message: "Invalid board state" });
        if (boardResult && !["white_win", "black_win", "draw"].includes(boardResult)) {
            return res.status(400).json({ message: "Invalid board result" });
        }

        commitElapsed(match);

        if (myColor === "white" && match.whiteTimeMs <= 0) {
            await finalizeMatch(match, "black_win", "White time expired");
            return res.json({ completed: true, message: "Time expired. Black wins." });
        }
        if (myColor === "black" && match.blackTimeMs <= 0) {
            await finalizeMatch(match, "white_win", "Black time expired");
            return res.json({ completed: true, message: "Time expired. White wins." });
        }

        // BYTEFEST Checkmate time control: 8+3.
        // The player receives +3 seconds after successfully completing a move.
        const incrementMs = Number(match.incrementMs || 3000);
        if (myColor === "white") match.whiteTimeMs += incrementMs;
        else match.blackTimeMs += incrementMs;

        let capturedValue = 0;
        if (capturedPiece) {
            const captures = myColor === "white" ? match.whiteCaptured : match.blackCaptured;
            const count = Number(captures[capturedPiece] || 0);
            if (count >= CAPTURE_LIMITS[capturedPiece]) {
                return res.status(409).json({ message: `Maximum ${capturedPiece} captures already recorded` });
            }

            captures[capturedPiece] = count + 1;
            capturedValue = PIECE_VALUES[capturedPiece];

            if (myColor === "white") match.blackMaterial = Math.max(0, match.blackMaterial - capturedValue);
            else match.whiteMaterial = Math.max(0, match.whiteMaterial - capturedValue);
        }

        if (myColor === "white") match.whiteMoves += 1;
        else match.blackMoves += 1;

        if (fen) match.fen = fen;
        if (notation) match.lastMoveNotation = notation;

        match.moves.push({
            color: myColor,
            capturedPiece,
            capturedValue,
            notation,
            from,
            to,
            fen,
            whiteMaterial: match.whiteMaterial,
            blackMaterial: match.blackMaterial,
            at: new Date()
        });

        match.activeColor = myColor === "white" ? "black" : "white";
        match.turnStartedAt = new Date();
        await match.save();

        if (boardResult) {
            await finalizeMatch(match, boardResult, boardResultReason || "Digital chess board result");
        } else {
            await materialAdjudicationIfNeeded(match);
        }
        const fresh = await CheckmateMatch.findById(match._id);

        return res.json({
            completed: fresh.status === "completed",
            message: fresh.status === "completed"
                ? `${fresh.result.replaceAll("_", " ").toUpperCase()} · ${fresh.resultReason}`
                : `Move recorded${capturedPiece ? ` · captured ${capturedPiece} (${capturedValue} pt)` : ""}.`
        });
    } catch (error) {
        console.error("Checkmate move error:", error);
        res.status(error.status || 500).json({ message: error.status ? error.message : "Server error" });
    }
});


router.post("/security/violation", requirePlayer, async (req, res) => {
    try {
        const player = req.checkmatePlayer;
        const match = await currentMatch(player.registrationId);
        if (!match) return res.status(404).json({ message: "No active Checkmate match" });
        if (match.status === "completed") return res.status(409).json({ message: "Match is already completed" });

        if (match.security?.locked) {
            return res.json({
                locked: true,
                violations: Number(match.security?.violations || 0),
                maxViolations: MAX_VIOLATIONS,
                message: "Checkmate station is already locked"
            });
        }

        if (!match.security) {
            match.security = { violations: 0, locked: false, lockReason: "", events: [] };
        }

        // Only running play is treated as a security violation.
        // While waiting or coordinator-paused, leaving fullscreen does not penalize players.
        if (match.status !== "running") {
            return res.json({
                locked: false,
                violations: Number(match.security.violations || 0),
                maxViolations: MAX_VIOLATIONS,
                message: "Match is not running; no violation recorded"
            });
        }

        commitElapsed(match);
        match.status = "paused";
        match.pausedBySecurity = true;
        match.turnStartedAt = null;

        match.security.violations = Math.min(
            MAX_VIOLATIONS,
            Number(match.security.violations || 0) + 1
        );
        match.security.locked = true;
        match.security.lockReason = clean(req.body?.reason) || "Fullscreen exited";
        match.security.events.push({
            reason: match.security.lockReason,
            detail: clean(req.body?.detail),
            at: new Date()
        });

        match.markModified("security");
        await match.save();

        return res.json({
            locked: true,
            violations: match.security.violations,
            maxViolations: MAX_VIOLATIONS,
            coordinatorDecisionRequired: match.security.violations >= MAX_VIOLATIONS,
            message: `Checkmate security violation ${match.security.violations}/${MAX_VIOLATIONS}. Coordinator password required.`
        });
    } catch (error) {
        console.error("Checkmate security violation error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/security/unlock", requirePlayer, async (req, res) => {
    try {
        const required = String(
            process.env.CHECKMATE_COORDINATOR_PASSWORD ||
            process.env.CODESPRINT_COORDINATOR_PASSWORD ||
            ""
        );
        if (!required) {
            return res.status(503).json({
                message: "CHECKMATE_COORDINATOR_PASSWORD is not configured"
            });
        }

        const password = clean(req.body?.password);
        const { safeEqual } = require("../utils/checkmateAuth");
        if (!safeEqual(password, required)) {
            return res.status(403).json({ message: "Incorrect coordinator password" });
        }

        const player = req.checkmatePlayer;
        const match = await currentMatch(player.registrationId);
        if (!match) return res.status(404).json({ message: "No active Checkmate match" });

        if (!match.security?.locked) {
            return res.json({
                unlocked: true,
                violations: Number(match.security?.violations || 0),
                maxViolations: MAX_VIOLATIONS,
                message: "Checkmate station is already unlocked"
            });
        }

        match.security.locked = false;
        match.security.lockReason = "";

        const events = match.security.events || [];
        const last = events[events.length - 1];
        if (last) {
            last.unlockedAt = new Date();
            last.unlockedBy = "coordinator";
        }

        const control = await eventControl();
        if (match.pausedBySecurity) {
            match.pausedBySecurity = false;
            if (control.status === "running") {
                match.status = "running";
                match.turnStartedAt = new Date();
            }
        }

        match.markModified("security");
        await match.save();

        return res.json({
            unlocked: true,
            violations: Number(match.security.violations || 0),
            maxViolations: MAX_VIOLATIONS,
            message: "Checkmate unlocked. Return to fullscreen to continue."
        });
    } catch (error) {
        console.error("Checkmate security unlock error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/resign", requirePlayer, async (req, res) => {
    try {
        await ensureRunningEvent();

        const player = req.checkmatePlayer;
        const match = await currentMatch(player.registrationId);
        if (!match) return res.status(404).json({ message: "No active Checkmate match" });
        if (match.status !== "running") return res.status(409).json({ message: "Match is not running" });

        const result = match.whiteRegistrationId === player.registrationId ? "black_win" : "white_win";
        await finalizeMatch(match, result, `${player.playerName} resigned`);
        res.json({ message: "Resignation recorded" });
    } catch (error) {
        console.error("Checkmate resign error:", error);
        res.status(error.status || 500).json({ message: error.status ? error.message : "Server error" });
    }
});

module.exports = router;
