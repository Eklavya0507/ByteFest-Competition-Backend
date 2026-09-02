const express = require("express");
const { requireAdmin } = require("../utils/adminAuth");
const { listApprovedRegistrations, findRegistration } = require("../utils/registrationDb");
const { makeCompetitionPassword, clean } = require("../utils/competitionPassword");

const CodeSprintTeam = require("../models/CodeSprintTeam");
const BugHuntTeam = require("../models/BugHuntTeam");
const BugHuntControl = require("../models/BugHuntControl");
const CheckmatePlayer = require("../models/CheckmatePlayer");
const CheckmateMatch = require("../models/CheckmateMatch");
const EventControl = require("../models/EventControl");
const { standardWorkbook, checkmateWorkbook } = require("../utils/reportWorkbook");

const checkmateAuth = require("../utils/checkmateAuth");
const bugRoutes = require("./bughunt");
const {
    refreshRanks,
    publicMatch,
    pauseMatch,
    resumeMatch,
    finalizeMatch,
    checkTimeout
} = require("../utils/checkmateService");

const router = express.Router();
const EVENTS = ["Code Sprint", "Bug Hunt", "Checkmate"];

function names(registration) {
    return [registration?.participant?.name, ...(registration?.members || []).map(member => member?.name)]
        .map(clean)
        .filter(Boolean);
}

function score(team, key) {
    return Number(team?.progress?.[key]?.score || 0);
}

function normalizeEvent(value) {
    const event = clean(value);
    return EVENTS.includes(event) ? event : "";
}

function nextIncompleteBugStage(team, roundKey) {
    const stages = team?.progress?.[roundKey]?.stages || {};
    let stage = 1;
    while (stages[`stage${stage}`]?.completedAt) stage += 1;
    return stage;
}

async function getEventControl(event) {
    return EventControl.findOneAndUpdate(
        { event },
        { $setOnInsert: { event } },
        { upsert: true, new: true }
    );
}

async function syncCheckmatePlayers() {
    const registrations = await listApprovedRegistrations("Checkmate");

    for (const registration of registrations) {
        const registrationId = clean(registration.registrationId).toUpperCase();
        const playerName = clean(registration?.participant?.name);
        if (!registrationId || !playerName) continue;

        const password = makeCompetitionPassword(registration);
        await CheckmatePlayer.findOneAndUpdate(
            { registrationId },
            {
                $set: {
                    playerName,
                    passwordHash: checkmateAuth.hashPassword(password)
                },
                $setOnInsert: { registrationId }
            },
            { upsert: true, new: true }
        );
    }

    await refreshRanks();
    return registrations;
}

async function checkmateRows() {
    const registrations = await syncCheckmatePlayers();
    const players = await CheckmatePlayer.find({
        registrationId: { $in: registrations.map(item => item.registrationId) }
    }).lean();

    const regMap = new Map(registrations.map(item => [item.registrationId, item]));
    const activeMatches = await CheckmateMatch.find({
        status: { $in: ["waiting", "running", "paused"] }
    }).lean();

    const matchMap = new Map();
    for (const match of activeMatches) {
        matchMap.set(match.whiteRegistrationId, { ...match, color: "white" });
        matchMap.set(match.blackRegistrationId, { ...match, color: "black" });
    }

    return players
        .sort((a, b) => Number(a.rank || 9999) - Number(b.rank || 9999))
        .map(player => {
            const registration = regMap.get(player.registrationId);
            const current = matchMap.get(player.registrationId);

            let currentMaterial = null;
            let moves = null;

            if (current) {
                currentMaterial = current.color === "white" ? current.whiteMaterial : current.blackMaterial;
                moves = current.color === "white" ? current.whiteMoves : current.blackMoves;
            }

            return {
                registrationId: player.registrationId,
                playerName: player.playerName,
                password: registration ? makeCompetitionPassword(registration) : "",
                tournamentPoints: Number(player.tournamentPoints || 0),
                wins: Number(player.wins || 0),
                draws: Number(player.draws || 0),
                losses: Number(player.losses || 0),
                capturePoints: Number(player.capturePoints || 0),
                materialDifferential: Number(player.materialFor || 0) - Number(player.materialAgainst || 0),
                totalMoves: Number(player.totalMoves || 0),
                rank: player.rank || null,
                finalPlace: player.finalPlace || null,
                currentMaterial,
                moves,
                currentMatch: current ? {
                    id: String(current._id),
                    phase: current.phase,
                    boardNumber: current.boardNumber,
                    status: current.status,
                    color: current.color
                } : null
            };
        });
}

router.get("/registrations", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(req.query.event);
        if (!event) return res.status(400).json({ message: "Select Code Sprint, Bug Hunt or Checkmate" });

        if (event === "Checkmate") {
            return res.json(await checkmateRows());
        }

        const registrations = await listApprovedRegistrations(event);
        const Model = event === "Code Sprint" ? CodeSprintTeam : BugHuntTeam;
        const states = await Model.find({
            registrationId: { $in: registrations.map(registration => registration.registrationId) }
        }).lean();

        const map = new Map(states.map(state => [state.registrationId, state]));

        const rows = registrations.map(registration => {
            const state = map.get(registration.registrationId);
            return {
                registrationId: registration.registrationId,
                teamName: registration.teamName || "",
                members: names(registration),
                password: registration.teamName ? makeCompetitionPassword(registration) : "TEAM NAME NOT SET",
                loggedIn: Boolean(state),
                currentRound: state?.currentRound || "not_started",
                currentStage: state?.currentStage || 1,
                totalScore: event === "Code Sprint"
                    ? Number(state?.totalScore || 0)
                    : Number(state?.qualificationScore || 0),
                round1: score(state, "round1"),
                round2: score(state, "round2"),
                round3: event === "Bug Hunt" ? score(state, "round3") : undefined,
                surprise: event === "Bug Hunt" ? score(state, "surprise") : undefined,
                finalScore: event === "Bug Hunt" ? score(state, "final") : undefined,
                hints: Number(state?.totalHintsUsed || 0),
                rank: state?.rank || null,
                finalPlace: state?.finalPlace || state?.knockout?.finalPlace || null,
                violations: Number(state?.security?.violations || 0),
                locked: Boolean(state?.security?.locked),
                disqualified: Boolean(state?.security?.disqualified)
            };
        });

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: error.message === "REGISTRATION_MONGODB_URI is not configured"
                ? error.message
                : "Server error"
        });
    }
});

router.patch("/team/:event/:registrationId/security", requireAdmin, async (req, res) => {
    try {
        const event = decodeURIComponent(req.params.event);
        const id = clean(req.params.registrationId).toUpperCase();
        const action = clean(req.body?.action).toLowerCase();

        const Model =
            event === "Code Sprint" ? CodeSprintTeam :
            event === "Bug Hunt" ? BugHuntTeam :
            null;

        if (!Model) return res.status(400).json({ message: "Unsupported event" });

        const team = await Model.findOne({ registrationId: id });
        if (!team) return res.status(404).json({ message: "Team has not entered the competition yet" });

        if (action === "unlock") {
            team.security.locked = false;
            team.security.lockReason = "";
        } else if (action === "lock") {
            team.security.locked = true;
            team.security.lockReason = "Locked by admin";
        } else if (action === "disqualify") {
            team.security.disqualified = true;
            team.security.locked = true;
            team.currentRound = "eliminated";
        } else if (action === "resume") {
            /*
              ONE MORE CHANCE for a disqualified Bug Hunt team.
              DQ changes currentRound to "eliminated", so simply clearing the
              disqualified flag is not enough. Restore the team to the CURRENT
              official Bug Hunt phase while keeping its existing score/progress.
            */
            if (event === "Bug Hunt" && team.security.disqualified) {
                const bugControl = await bugRoutes.getControl();
                const bugPhase = bugRoutes.phaseFrom(bugControl).key;

                if (bugPhase === "completed") {
                    return res.status(409).json({
                        message: "Bug Hunt has already finished. Use RESET BUG HUNT only if you are intentionally starting a fresh event."
                    });
                }

                if (bugPhase === "final") {
                    if (!(Number(team.rank) >= 1 && Number(team.rank) <= 3)) {
                        return res.status(409).json({
                            message: "Qualification is already finished and this team was not a Top 3 finalist."
                        });
                    }
                    team.currentRound = "final";
                    team.currentStage = nextIncompleteBugStage(team, "final");
                } else if (["round1", "round2", "round3", "surprise"].includes(bugPhase)) {
                    team.currentRound = bugPhase;
                    team.currentStage = nextIncompleteBugStage(team, bugPhase);
                } else {
                    team.currentRound = "waiting_start";
                    team.currentStage = 1;
                }
            }

            team.security.disqualified = false;
            team.security.locked = false;
            team.security.lockReason = "";
        } else {
            return res.status(400).json({ message: "Use lock, unlock, disqualify or resume" });
        }

        await team.save();
        res.json({ message: `${action} applied`, registrationId: id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

/* ---------------- Event start / stop / resume ---------------- */

router.get("/control/:event", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(decodeURIComponent(req.params.event));
        if (!event) return res.status(400).json({ message: "Unsupported event" });
        const control = await getEventControl(event);
        res.json({
            event,
            status: control.status,
            startedAt: control.startedAt,
            pausedAt: control.pausedAt,
            totalPausedMs: control.totalPausedMs
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/control/:event/start", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(decodeURIComponent(req.params.event));
        if (!event) return res.status(400).json({ message: "Unsupported event" });

        const control = await getEventControl(event);
        if (control.status === "running") return res.status(409).json({ message: `${event} is already running` });
        if (control.status === "paused") return res.status(409).json({ message: `Use RESUME for ${event}` });

        const now = new Date();
        control.status = "running";
        control.startedAt = now;
        control.pausedAt = null;
        control.totalPausedMs = 0;
        control.startedBy = req.admin?.email || "admin";
        control.updatedBy = req.admin?.email || "admin";
        await control.save();

        if (event === "Bug Hunt") {
            await BugHuntControl.findOneAndUpdate(
                { key: "bughunt" },
                { $set: { startedAt: now, startedBy: req.admin?.email || "admin", finalizedAt: null } },
                { upsert: true, new: true }
            );
        }

        res.json({ message: `${event} started`, startedAt: now });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/control/:event/stop", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(decodeURIComponent(req.params.event));
        if (!event) return res.status(400).json({ message: "Unsupported event" });

        const control = await getEventControl(event);
        if (control.status !== "running") return res.status(409).json({ message: `${event} is not running` });

        control.status = "paused";
        control.pausedAt = new Date();
        control.updatedBy = req.admin?.email || "admin";
        await control.save();

        if (event === "Checkmate") {
            const matches = await CheckmateMatch.find({ status: "running" });
            for (const match of matches) await pauseMatch(match, true);
        }

        res.json({ message: `${event} stopped. Active play is paused.`, pausedAt: control.pausedAt });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

function shiftDate(value, ms) {
    return value ? new Date(new Date(value).getTime() + ms) : value;
}

async function shiftCodeSprintTimers(pauseMs) {
    if (!pauseMs) return;

    const teams = await CodeSprintTeam.find({});
    for (const team of teams) {
        let changed = false;
        const progress = team.progress || {};

        for (const round of Object.values(progress)) {
            if (!round || typeof round !== "object") continue;

            if (round.startedAt && !round.completedAt) {
                round.startedAt = shiftDate(round.startedAt, pauseMs);
                changed = true;
            }

            for (const stage of Object.values(round.stages || {})) {
                if (stage?.startedAt && !stage?.completedAt) {
                    stage.startedAt = shiftDate(stage.startedAt, pauseMs);
                    changed = true;
                }
            }
        }

        if (changed) {
            team.markModified("progress");
            await team.save();
        }
    }
}

router.post("/control/:event/resume", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(decodeURIComponent(req.params.event));
        if (!event) return res.status(400).json({ message: "Unsupported event" });

        const control = await getEventControl(event);
        if (control.status !== "paused" || !control.pausedAt) {
            return res.status(409).json({ message: `${event} is not paused` });
        }

        const now = new Date();
        const pauseMs = Math.max(0, now.getTime() - new Date(control.pausedAt).getTime());

        if (event === "Bug Hunt") {
            const bugControl = await BugHuntControl.findOne({ key: "bughunt" });
            if (bugControl?.startedAt) {
                bugControl.startedAt = shiftDate(bugControl.startedAt, pauseMs);
                await bugControl.save();
            }
        } else if (event === "Code Sprint") {
            await shiftCodeSprintTimers(pauseMs);
        } else if (event === "Checkmate") {
            const matches = await CheckmateMatch.find({ status: "paused", pausedByEvent: true });
            for (const match of matches) await resumeMatch(match);
        }

        control.status = "running";
        control.pausedAt = null;
        control.totalPausedMs = Number(control.totalPausedMs || 0) + pauseMs;
        control.updatedBy = req.admin?.email || "admin";
        await control.save();

        res.json({ message: `${event} resumed`, pauseMs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

/* ---------------- Checkmate admin ---------------- */

router.get("/checkmate/matches", requireAdmin, async (req, res) => {
    try {
        const matches = await CheckmateMatch.find({}).sort({ createdAt: -1 }).limit(200);

        for (const match of matches) {
            if (match.status === "running") await checkTimeout(match);
        }

        const freshMatches = await CheckmateMatch.find({}).sort({ createdAt: -1 }).limit(200);
        const playerIds = [...new Set(freshMatches.flatMap(match => [match.whiteRegistrationId, match.blackRegistrationId]))];
        const players = await CheckmatePlayer.find({ registrationId: { $in: playerIds } }).lean();
        const playerMap = new Map(players.map(player => [player.registrationId, player]));

        res.json(freshMatches.map(match =>
            publicMatch(
                match,
                playerMap.get(match.whiteRegistrationId),
                playerMap.get(match.blackRegistrationId)
            )
        ));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/checkmate/matches", requireAdmin, async (req, res) => {
    try {
        const phase = clean(req.body?.phase);
        const whiteRegistrationId = clean(req.body?.whiteRegistrationId).toUpperCase();
        const blackRegistrationId = clean(req.body?.blackRegistrationId).toUpperCase();
        const boardNumber = Number(req.body?.boardNumber || 1);
        const clockMinutes = 8;
        const incrementSeconds = 3;

        if (!["round1", "round2", "round3", "semifinal", "final"].includes(phase)) {
            return res.status(400).json({ message: "Invalid Checkmate stage" });
        }
        if (!/^BF26-[A-Z0-9]{8}$/.test(whiteRegistrationId) || !/^BF26-[A-Z0-9]{8}$/.test(blackRegistrationId)) {
            return res.status(400).json({ message: "Enter valid Registration IDs" });
        }
        if (whiteRegistrationId === blackRegistrationId) {
            return res.status(400).json({ message: "White and Black must be different players" });
        }

        const [whiteRegistration, blackRegistration] = await Promise.all([
            findRegistration(whiteRegistrationId),
            findRegistration(blackRegistrationId)
        ]);

        if (
            !whiteRegistration ||
            whiteRegistration.event !== "Checkmate" ||
            whiteRegistration.payment?.status !== "PAID"
        ) {
            return res.status(404).json({ message: "White player is not an approved Checkmate registration" });
        }

        if (
            !blackRegistration ||
            blackRegistration.event !== "Checkmate" ||
            blackRegistration.payment?.status !== "PAID"
        ) {
            return res.status(404).json({ message: "Black player is not an approved Checkmate registration" });
        }

        await syncCheckmatePlayers();

        const busy = await CheckmateMatch.findOne({
            status: { $in: ["waiting", "running", "paused"] },
            $or: [
                { whiteRegistrationId: { $in: [whiteRegistrationId, blackRegistrationId] } },
                { blackRegistrationId: { $in: [whiteRegistrationId, blackRegistrationId] } }
            ]
        });

        if (busy) return res.status(409).json({ message: "One of these players already has an active/created match" });

        const limit = clockMinutes * 60 * 1000;
        const match = await CheckmateMatch.create({
            phase,
            boardNumber,
            whiteRegistrationId,
            blackRegistrationId,
            whiteName: clean(whiteRegistration.participant?.name),
            blackName: clean(blackRegistration.participant?.name),
            clockLimitMs: limit,
            whiteTimeMs: limit,
            blackTimeMs: limit,
            incrementMs: incrementSeconds * 1000
        });

        res.status(201).json({ message: "Checkmate match created", id: String(match._id) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/checkmate/match/:id/start", requireAdmin, async (req, res) => {
    try {
        const control = await getEventControl("Checkmate");
        if (control.status !== "running") return res.status(409).json({ message: "Start Checkmate event first" });

        const match = await CheckmateMatch.findById(req.params.id);
        if (!match) return res.status(404).json({ message: "Match not found" });
        if (match.status !== "waiting") return res.status(409).json({ message: "Only a waiting match can be started" });

        match.status = "running";
        match.activeColor = "white";
        match.startedAt = new Date();
        match.turnStartedAt = new Date();
        await match.save();

        res.json({ message: "Match started. White clock is running." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/checkmate/match/:id/stop", requireAdmin, async (req, res) => {
    try {
        const match = await CheckmateMatch.findById(req.params.id);
        if (!match) return res.status(404).json({ message: "Match not found" });
        await pauseMatch(match, false);
        res.json({ message: "Match stopped. Both clocks are paused." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/checkmate/match/:id/resume", requireAdmin, async (req, res) => {
    try {
        const control = await getEventControl("Checkmate");
        if (control.status !== "running") return res.status(409).json({ message: "Resume Checkmate event first" });

        const match = await CheckmateMatch.findById(req.params.id);
        if (!match) return res.status(404).json({ message: "Match not found" });
        if (match.security?.locked) {
            return res.status(423).json({ message: "Security locked. Use UNLOCK first." });
        }
        await resumeMatch(match);
        res.json({ message: "Match resumed." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});


router.patch("/checkmate/match/:id/security", requireAdmin, async (req, res) => {
    try {
        const action = clean(req.body?.action).toLowerCase();
        if (!["lock", "unlock"].includes(action)) {
            return res.status(400).json({ message: "Use lock or unlock" });
        }

        const match = await CheckmateMatch.findById(req.params.id);
        if (!match) return res.status(404).json({ message: "Match not found" });
        if (match.status === "completed") return res.status(409).json({ message: "Match already completed" });

        if (!match.security) {
            match.security = { violations: 0, locked: false, lockReason: "", events: [] };
        }

        if (action === "lock") {
            if (match.status === "running") {
                commitElapsed(match);
                match.status = "paused";
                match.pausedBySecurity = true;
                match.turnStartedAt = null;
            }
            match.security.locked = true;
            match.security.lockReason = "Locked by admin";
            match.security.events.push({
                reason: match.security.lockReason,
                detail: "Admin dashboard security lock",
                at: new Date()
            });
        } else {
            match.security.locked = false;
            match.security.lockReason = "";
            const last = match.security.events?.[match.security.events.length - 1];
            if (last) {
                last.unlockedAt = new Date();
                last.unlockedBy = "admin";
            }

            const control = await getEventControl("Checkmate");
            if (match.pausedBySecurity) {
                match.pausedBySecurity = false;
                if (control.status === "running") {
                    match.status = "running";
                    match.turnStartedAt = new Date();
                }
            }
        }

        match.markModified("security");
        await match.save();
        res.json({ message: action === "lock" ? "Checkmate station locked." : "Checkmate station unlocked." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/checkmate/match/:id/end", requireAdmin, async (req, res) => {
    try {
        const result = clean(req.body?.result);
        const reason = clean(req.body?.reason) || "Coordinator decision";
        if (!["white_win", "black_win", "draw"].includes(result)) {
            return res.status(400).json({ message: "Use white_win, black_win or draw" });
        }

        const match = await CheckmateMatch.findById(req.params.id);
        if (!match) return res.status(404).json({ message: "Match not found" });
        if (match.status === "completed") return res.status(409).json({ message: "Match already completed" });

        await finalizeMatch(match, result, reason);
        res.json({ message: "Match result saved" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

/* ---------------- Fresh Bug Hunt event reset ---------------- */
router.post("/bughunt/reset", requireAdmin, async (req, res) => {
    try {
        if (clean(req.body?.confirm) !== "RESET BUG HUNT") {
            return res.status(400).json({ message: "Type RESET BUG HUNT to confirm the fresh-event reset" });
        }

        /*
          BugHuntTeam is competition-only state. Approved registrations live in
          REGISTRATION_MONGODB_URI and are NOT deleted here. Deleting these test
          team records clears yesterday's scores, DQ flags, ranks, final results
          and old competition sessions. Teams are recreated on their next login.
        */
        const cleared = await BugHuntTeam.deleteMany({});

        await BugHuntControl.findOneAndUpdate(
            { key: "bughunt" },
            {
                $set: {
                    startedAt: null,
                    startedBy: "",
                    finalizedAt: null
                }
            },
            { upsert: true, new: true }
        );

        await EventControl.findOneAndUpdate(
            { event: "Bug Hunt" },
            {
                $set: {
                    status: "not_started",
                    startedAt: null,
                    pausedAt: null,
                    totalPausedMs: 0,
                    startedBy: "",
                    updatedBy: req.admin?.email || "admin"
                }
            },
            { upsert: true, new: true }
        );

        res.json({
            message: `Bug Hunt reset for a fresh start. ${Number(cleared.deletedCount || 0)} old competition team record(s) cleared. Approved registrations are safe.`,
            clearedTeams: Number(cleared.deletedCount || 0),
            registrationDataChanged: false
        });
    } catch (error) {
        console.error("Bug Hunt reset error:", error);
        res.status(500).json({ message: "Could not reset Bug Hunt" });
    }
});

/* Legacy Bug Hunt control endpoints kept for old frontend compatibility. */
router.get("/bughunt/control", requireAdmin, async (req, res) => {
    try {
        const control = await getEventControl("Bug Hunt");
        const bugControl = await bugRoutes.getControl();
        const currentPhase = bugRoutes.phaseFrom(bugControl);
        res.json({
            startedAt: bugControl.startedAt,
            phase: control.status === "paused" ? "paused" : currentPhase.key,
            phaseEndsAt: currentPhase.endsAt,
            finalizedAt: bugControl.finalizedAt
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/bughunt/start", requireAdmin, async (req, res) => {
    try {
        const control = await getEventControl("Bug Hunt");
        if (control.status !== "not_started") {
            return res.status(409).json({ message: "Bug Hunt is already started or paused" });
        }
        req.params.event = "Bug Hunt";
        return res.status(409).json({ message: "Use the new START BUG HUNT button/control endpoint" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/rankings", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(req.query.event);

        if (event === "Checkmate") {
            const rows = await checkmateRows();
            return res.json(rows.map(player => ({
                registrationId: player.registrationId,
                teamName: player.playerName,
                rank: player.rank,
                score: player.tournamentPoints,
                finalPlace: player.finalPlace,
                status: player.currentMatch?.phase || "waiting"
            })));
        }

        const Model = event === "Bug Hunt" ? BugHuntTeam : CodeSprintTeam;
        const rows = await Model.find({}).sort({
            finalPlace: 1,
            rank: 1,
            totalScore: -1,
            qualificationScore: -1
        }).lean();

        res.json(rows.map(team => ({
            registrationId: team.registrationId || team.teamId,
            teamName: team.teamName,
            rank: team.rank || null,
            score: event === "Bug Hunt"
                ? Number(team.qualificationScore || 0)
                : Number(team.totalScore || 0),
            finalPlace: team.finalPlace || team.knockout?.finalPlace || null,
            status: team.currentRound
        })));
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});


/* ---------------- Individual team restart ---------------- */
router.post("/team/:event/:registrationId/restart", requireAdmin, async (req, res) => {
    try {
        const event = decodeURIComponent(req.params.event);
        const id = clean(req.params.registrationId).toUpperCase();
        const Model = event === "Code Sprint" ? CodeSprintTeam : event === "Bug Hunt" ? BugHuntTeam : null;
        if (!Model) return res.status(400).json({ message: "Restart is available for Code Sprint and Bug Hunt" });

        const team = await Model.findOne({ registrationId: id });
        if (!team) return res.status(404).json({ message: "Competition record not found. The team may not have logged in yet." });

        team.progress = {};
        team.currentStage = 1;
        team.totalHintsUsed = 0;
        team.rank = null;
        team.security.violations = 0;
        team.security.locked = false;
        team.security.lockReason = "";
        team.security.disqualified = false;
        team.security.events = [];

        if (event === "Code Sprint") {
            team.currentRound = "round1";
            team.totalScore = 0;
            team.correctStages = 0;
            team.knockout = {
                semifinalWinner: null,
                bestSemifinalLoser: false,
                wildcardEntryWinner: null,
                entryFinalWinner: null,
                wildcardFinalWinner: null,
                finalPlace: null
            };
        } else {
            const bugControl = await bugRoutes.getControl();
            const bugPhase = bugRoutes.phaseFrom(bugControl);
            if (!["waiting_start", "round1"].includes(bugPhase.key)) {
                return res.status(409).json({
                    message: "Bug Hunt uses one synchronized official timeline. Full restart is allowed before start or during Round 1 only; later use coordinator unlock or restart the whole Bug Hunt event."
                });
            }
            team.currentRound = bugPhase.key;
            team.qualificationScore = 0;
            team.finalScore = 0;
            team.wrongSubmissions = 0;
            team.finalPlace = null;
        }

        team.markModified("progress");
        team.markModified("security");
        if (event === "Code Sprint") team.markModified("knockout");
        await team.save();

        res.json({
            message: `${event} restarted for ${id}. Scores, hints, attempts, rank and security progress were cleared.`,
            registrationId: id,
            currentRound: team.currentRound
        });
    } catch (error) {
        console.error("Competition restart error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

/* ---------------- Polished Excel teacher report ---------------- */
router.get("/report/:event.xlsx", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(decodeURIComponent(req.params.event));
        if (!event) return res.status(400).json({ message: "Unsupported event" });

        let workbook;
        if (event === "Checkmate") {
            const players = await checkmateRows();
            const matches = await CheckmateMatch.find({}).sort({ createdAt: 1 }).lean();
            workbook = await checkmateWorkbook({ players, matches });
        } else {
            const registrations = await listApprovedRegistrations(event);
            const Model = event === "Code Sprint" ? CodeSprintTeam : BugHuntTeam;
            const approvedIds = registrations.map(item => clean(item.registrationId).toUpperCase()).filter(Boolean);
            const teams = await Model.find({ registrationId: { $in: approvedIds } }).lean();
            workbook = await standardWorkbook({ event, registrations, teams });
        }

        const filename = `BYTEFEST_2026_${event.replace(/\s+/g, "_")}_Official_Report.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Excel report error:", error);
        res.status(500).json({ message: "Could not create Excel report" });
    }
});

module.exports = router;
