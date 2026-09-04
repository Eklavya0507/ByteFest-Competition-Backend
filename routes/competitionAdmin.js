const express = require("express");
const { requireAdmin } = require("../utils/adminAuth");
const { listApprovedRegistrations, findRegistration } = require("../utils/registrationDb");
const { makeCompetitionPassword, clean } = require("../utils/competitionPassword");

const BugHuntTeam = require("../models/BugHuntTeam");
const BugHuntControl = require("../models/BugHuntControl");
const CheckmatePlayer = require("../models/CheckmatePlayer");
const CheckmateMatch = require("../models/CheckmateMatch");
const EventControl = require("../models/EventControl");
const { standardWorkbook, checkmateWorkbook } = require("../utils/reportWorkbook");
const bugHuntQuestions = require("../config/bughuntQuestions");

const checkmateAuth = require("../utils/checkmateAuth");
const bugAuth = require("../utils/bugHuntAuth");
const bugRoutes = require("./bughunt");
const {
    refreshRanks,
    compareCheckmatePlayers,
    publicMatch,
    pauseMatch,
    resumeMatch,
    finalizeMatch,
    checkTimeout,
    commitElapsed
} = require("../utils/checkmateService");

const router = express.Router();
const EVENTS = ["Bug Hunt", "Checkmate"];

function names(registration) {
    return [registration?.participant?.name, ...(registration?.members || []).map(member => member?.name)]
        .map(clean)
        .filter(Boolean);
}

function bugHasEntered(team) {
    if (!team) return false;
    if (team.enteredAt) return true;
    if (team.currentRound && team.currentRound !== "waiting_start") return true;
    return Object.values(team.progress || {}).some(round => Boolean(round?.startedAt));
}

async function syncBugHuntRegistrationTeams() {
    const registrations = await listApprovedRegistrations("Bug Hunt");
    if (!registrations.length) return 0;
    const operations = registrations
        .filter(registration => clean(registration.registrationId) && clean(registration.teamName))
        .map(registration => {
            const registrationId = clean(registration.registrationId).toUpperCase();
            return {
                updateOne: {
                    filter: { registrationId },
                    update: {
                        $setOnInsert: {
                            registrationId,
                            teamId: registrationId,
                            enteredAt: null,
                            currentRound: "waiting_start",
                            currentStage: 1
                        },
                        $set: {
                            teamName: clean(registration.teamName),
                            members: names(registration),
                            passwordHash: bugAuth.hashPassword(makeCompetitionPassword(registration))
                        }
                    },
                    upsert: true
                }
            };
        });
    if (operations.length) await BugHuntTeam.bulkWrite(operations, { ordered: false });
    return operations.length;
}

function bugResumePosition(team) {
    if (Number(team.rank) >= 1 && Number(team.rank) <= 3 && team.progress?.final?.startedAt && !team.progress?.final?.completedAt) {
        return { round: "final", stage: nextIncompleteBugStage(team, "final") };
    }
    if (team.progress?.surprise?.completedAt) return { round: "awaiting_ranking", stage: 1 };
    for (const key of ["surprise", "round3", "round2", "round1"]) {
        if (team.progress?.[key]?.startedAt) return { round: key, stage: nextIncompleteBugStage(team, key) };
    }
    return { round: "waiting_start", stage: 1 };
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
    let control = await EventControl.findOne({ event });
    if (!control) control = await EventControl.create({ event });
    return control;
}

let checkmateRegistrationCache = [];
let checkmateRegistrationCacheAt = 0;
let checkmateSyncPromise = null;
const CHECKMATE_SYNC_TTL_MS = 30000;

async function syncCheckmatePlayers(force = false) {
    const now = Date.now();
    if (!force && checkmateRegistrationCache.length && now - checkmateRegistrationCacheAt < CHECKMATE_SYNC_TTL_MS) {
        return checkmateRegistrationCache;
    }
    if (checkmateSyncPromise) return checkmateSyncPromise;

    checkmateSyncPromise = (async () => {
        const registrations = await listApprovedRegistrations("Checkmate");
        const ids = registrations.map(item => clean(item.registrationId).toUpperCase()).filter(Boolean);
        const existing = await CheckmatePlayer.find({ registrationId: { $in: ids } }).lean();
        const existingMap = new Map(existing.map(player => [player.registrationId, player]));
        const operations = [];

        for (const registration of registrations) {
            const registrationId = clean(registration.registrationId).toUpperCase();
            const playerName = clean(registration?.participant?.name);
            if (!registrationId || !playerName) continue;

            const passwordHash = checkmateAuth.hashPassword(makeCompetitionPassword(registration));
            const current = existingMap.get(registrationId);
            if (!current) {
                operations.push({
                    updateOne: {
                        filter: { registrationId },
                        update: { $setOnInsert: { registrationId }, $set: { playerName, passwordHash } },
                        upsert: true
                    }
                });
            } else if (current.playerName !== playerName || current.passwordHash !== passwordHash) {
                operations.push({
                    updateOne: {
                        filter: { registrationId },
                        update: { $set: { playerName, passwordHash } }
                    }
                });
            }
        }

        const needsRankRefresh = operations.length > 0 || existing.some(player => !player.rank);
        if (operations.length) await CheckmatePlayer.bulkWrite(operations, { ordered: false });
        if (needsRankRefresh) await refreshRanks();
        checkmateRegistrationCache = registrations;
        checkmateRegistrationCacheAt = Date.now();
        return registrations;
    })();

    try {
        return await checkmateSyncPromise;
    } finally {
        checkmateSyncPromise = null;
    }
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
                rankSource: player.rankSource || "auto",
                finalPlace: player.finalPlace || null,
                finalPlaceSource: player.finalPlaceSource || "auto",
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


function bugQualificationScore(team) {
    return score(team, "round1") + score(team, "round2") + score(team, "round3") + score(team, "surprise");
}

function compareCodeQualification(a, b) {
    const scoreA = codeQualificationScore(a);
    const scoreB = codeQualificationScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;
    if (Number(a.totalHintsUsed || 0) !== Number(b.totalHintsUsed || 0)) {
        return Number(a.totalHintsUsed || 0) - Number(b.totalHintsUsed || 0);
    }
    const qa = score(a, "qualifier");
    const qb = score(b, "qualifier");
    if (qa !== qb) return qb - qa;
    if (Number(a.correctStages || 0) !== Number(b.correctStages || 0)) {
        return Number(b.correctStages || 0) - Number(a.correctStages || 0);
    }
    return stageCompletionTotal(a, ["round1", "round2", "qualifier"])
        - stageCompletionTotal(b, ["round1", "round2", "qualifier"]);
}

function roundDetails(event, team) {
    if (!team) return [];
    const config = bugHuntQuestions;
    return Object.entries(config).map(([key, round]) => {
        const progress = team.progress?.[key] || {};
        const totalStages = Number(round?.stages?.length || 0);
        let completedStages = 0;
        for (let index = 1; index <= totalStages; index += 1) {
            if (progress?.stages?.[`stage${index}`]?.completedAt) completedStages += 1;
        }
        const started = Boolean(progress.startedAt)
            || Object.values(progress.stages || {}).some(stage => Boolean(stage?.startedAt));
        const stages = [];
        for (let index = 1; index <= totalStages; index += 1) {
            const stage = progress?.stages?.[`stage${index}`] || {};
            stages.push({
                stage: index,
                title: round?.stages?.[index - 1]?.title || `Stage ${index}`,
                score: Number(stage.score || 0),
                attempts: Number(stage.attempts || 0),
                hintsUsed: Array.isArray(stage.hintsUsed) ? stage.hintsUsed.length : 0,
                startedAt: stage.startedAt || null,
                completedAt: stage.completedAt || null
            });
        }
        return {
            key,
            title: round?.title || key,
            score: score(team, key),
            completedStages,
            totalStages,
            started,
            stages,
            completed: Boolean(progress.completedAt) || (totalStages > 0 && completedStages >= totalStages)
        };
    }).filter(item => item.started || item.completed || item.score > 0 || item.key === team.currentRound);
}

function progressLabel(event, team, details) {
    if (!team) return "NOT ENTERED";
    if (team.security?.disqualified) return "DISQUALIFIED";
    if (team.currentRound === "eliminated") return "ELIMINATED";
    if (team.currentRound === "completed") return team.finalPlace || team.knockout?.finalPlace
        ? `COMPLETED · PLACE #${team.finalPlace || team.knockout?.finalPlace}`
        : "COMPLETED";
    if (team.currentRound === "awaiting_ranking") return "SURPRISE COMPLETE · WAITING FOR QUALIFICATION";
    if (String(team.currentRound || "").endsWith("_wait")) return `${String(team.currentRound).replaceAll("_", " ").toUpperCase()} · WAITING`;
    if (team.currentRound === "waiting_start") return "WAITING FOR EVENT START";

    const current = details.find(item => item.key === team.currentRound);
    if (!current) return String(team.currentRound || "NOT STARTED").replaceAll("_", " ").toUpperCase();
    if (current.completed) {
        if (event === "Bug Hunt" && current.key === "surprise") return "SURPRISE COMPLETE · WAITING FOR QUALIFICATION";
        if (current.key === "final") return "FINAL COMPLETE · WAITING FOR RESULT";
        return `${current.key.replaceAll("_", " ").toUpperCase()} COMPLETE · WAITING`;
    }
    if (!current.started) return `${current.key.replaceAll("_", " ").toUpperCase()} · NOT STARTED`;
    return `${current.key.replaceAll("_", " ").toUpperCase()} · STAGE ${Math.min(Number(team.currentStage || 1), current.totalStages || 1)}/${current.totalStages || 1}`;
}

router.get("/registrations", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(req.query.event);
        if (!event) return res.status(400).json({ message: "Select Bug Hunt or Checkmate" });

        if (event === "Checkmate") {
            return res.json(await checkmateRows());
        }

        const registrations = await listApprovedRegistrations("Bug Hunt");
        const states = await BugHuntTeam.find({
            registrationId: { $in: registrations.map(registration => registration.registrationId) }
        }).lean();

        const map = new Map(states.map(state => [state.registrationId, state]));
        const activeForPreview = states.filter(state => !state.security?.disqualified && bugHasEntered(state));
        const sortedPreview = [...activeForPreview].sort(bugRoutes.compareQualification);
        const liveRankMap = new Map(sortedPreview.map((state, index) => [state.registrationId, index + 1]));

        const rows = registrations.map(registration => {
            const state = map.get(registration.registrationId);
            const details = roundDetails("Bug Hunt", state);
            const qualification = bugQualificationScore(state);
            const entered = bugHasEntered(state);
            return {
                registrationId: registration.registrationId,
                teamName: registration.teamName || "",
                members: names(registration),
                password: registration.teamName ? makeCompetitionPassword(registration) : "TEAM NAME NOT SET",
                loggedIn: entered,
                currentRound: state?.currentRound || "not_started",
                currentStage: state?.currentStage || 1,
                progressLabel: state?.security?.disqualified
                    ? progressLabel("Bug Hunt", state, details)
                    : entered ? progressLabel("Bug Hunt", state, details) : "NOT ENTERED · WAITING LOGIN",
                progressDetails: details,
                totalScore: qualification,
                qualificationScore: qualification,
                round1: score(state, "round1"),
                round2: score(state, "round2"),
                round3: score(state, "round3"),
                surprise: score(state, "surprise"),
                finalScore: score(state, "final"),
                hints: Number(state?.totalHintsUsed || 0),
                wrongSubmissions: Number(state?.wrongSubmissions || 0),
                liveRank: state && !state.security?.disqualified ? liveRankMap.get(state.registrationId) || null : null,
                rank: state?.rank || null,
                rankSource: state?.rankSource || "auto",
                finalPlace: state?.finalPlace || null,
                finalPlaceSource: state?.finalPlaceSource || "auto",
                violations: Number(state?.security?.violations || 0),
                locked: Boolean(state?.security?.locked),
                lockReason: state?.security?.lockReason || "",
                disqualified: Boolean(state?.security?.disqualified),
                securityEvents: (state?.security?.events || []).slice(-10).map(event => ({
                    reason: event.reason || "Security event",
                    detail: event.detail || "",
                    at: event.at || null,
                    unlockedAt: event.unlockedAt || null
                })),
                lastSecurityEvent: (state?.security?.events || []).length ? {
                    reason: state.security.events[state.security.events.length - 1]?.reason || "Security event",
                    detail: state.security.events[state.security.events.length - 1]?.detail || "",
                    at: state.security.events[state.security.events.length - 1]?.at || null
                } : null
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

router.get("/security-alerts", requireAdmin, async (req, res) => {
    try {
        const teams = await BugHuntTeam.find({ "security.events.0": { $exists: true } }).lean();
        const alerts = [];
        for (const team of teams) {
            for (const event of (team.security?.events || []).slice(-20)) {
                alerts.push({
                    id: `${team.registrationId}:${new Date(event.at || 0).getTime()}:${event.reason || "event"}`,
                    registrationId: team.registrationId,
                    teamName: team.teamName || "",
                    members: team.members || [],
                    reason: event.reason || "Security event",
                    detail: event.detail || "",
                    at: event.at || null,
                    unlockedAt: event.unlockedAt || null,
                    violations: Number(team.security?.violations || 0),
                    locked: Boolean(team.security?.locked),
                    disqualified: Boolean(team.security?.disqualified)
                });
            }
        }
        alerts.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
        res.json(alerts.slice(0, 100));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.patch("/team/:event/:registrationId/security", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(decodeURIComponent(req.params.event));
        const id = clean(req.params.registrationId).toUpperCase();
        const action = clean(req.body?.action).toLowerCase();
        if (event !== "Bug Hunt") return res.status(400).json({ message: "Team security control is available for Bug Hunt" });

        const team = await BugHuntTeam.findOne({ registrationId: id });
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
            if (team.security.disqualified) {
                const bugControl = await bugRoutes.getControl();
                if (bugControl?.finalizedAt) {
                    return res.status(409).json({
                        message: "Bug Hunt has already finished. Use RESET BUG HUNT only for an intentional fresh event."
                    });
                }
                const restore = bugResumePosition(team);
                team.currentRound = restore.round;
                team.currentStage = restore.stage;
                const control = await getEventControl("Bug Hunt");
                if (control.status === "running" && team.currentRound === "waiting_start" && bugHasEntered(team)) {
                    team.currentRound = "round1";
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

router.patch("/team/:event/:registrationId/rank", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(decodeURIComponent(req.params.event));
        const id = clean(req.params.registrationId).toUpperCase();
        if (!event) return res.status(400).json({ message: "Unsupported event" });

        const raw = req.body?.rank;
        const resetToAuto = raw === null || raw === "" || clean(raw).toLowerCase() === "auto" || Number(raw) === 0;
        const rank = resetToAuto ? null : Number(raw);
        if (!resetToAuto && (!Number.isInteger(rank) || rank < 1)) {
            return res.status(400).json({ message: "Rank must be a positive whole number, or use AUTO" });
        }

        if (event === "Checkmate") {
            const player = await CheckmatePlayer.findOne({ registrationId: id });
            if (!player) return res.status(404).json({ message: "Checkmate player not found" });
            const playerCount = await CheckmatePlayer.countDocuments({});
            if (!resetToAuto && rank > playerCount) {
                return res.status(400).json({ message: `Rank must be between 1 and ${playerCount}` });
            }
            if (!resetToAuto) {
                const duplicate = await CheckmatePlayer.findOne({ registrationId: { $ne: id }, rank, rankSource: "manual" });
                if (duplicate) return res.status(409).json({ message: `Manual rank #${rank} is already assigned to ${duplicate.playerName}` });
                player.rank = rank;
                player.rankSource = "manual";
            } else {
                player.rankSource = "auto";
            }
            await player.save();
            await refreshRanks();
            return res.json({ message: resetToAuto ? "Checkmate rank returned to AUTO" : `Manual rank #${rank} saved`, registrationId: id });
        }

        const team = await BugHuntTeam.findOne({ registrationId: id });
        if (!team) return res.status(404).json({ message: "Team has not entered the competition yet" });
        if (team.security?.disqualified) return res.status(409).json({ message: "A disqualified team cannot receive a qualification rank" });

        const active = await BugHuntTeam.find({ "security.disqualified": { $ne: true } });
        if (!resetToAuto && rank > active.length) {
            return res.status(400).json({ message: `Rank must be between 1 and ${active.length}` });
        }

        const [readiness, bugStatus] = await Promise.all([
            bugRoutes.qualificationReadiness(),
            bugRoutes.competitionStatus()
        ]);
        if (bugStatus === "completed") {
            return res.status(409).json({ message: "Bug Hunt is already complete. Use SET FINAL to correct the final result." });
        }
        if (!readiness.allReady) {
            return res.status(409).json({
                message: `Manual qualification rank is available after every active team finishes Surprise. ${readiness.pendingTeams.length} team(s) are still in progress.`
            });
        }

        if (!resetToAuto) {
            const duplicate = active.find(item => item.registrationId !== id && Number(item.rank) === rank && item.rankSource === "manual");
            if (duplicate) return res.status(409).json({ message: `Manual rank #${rank} is already assigned to ${duplicate.teamName}` });
            team.rank = rank;
            team.rankSource = "manual";
        } else {
            team.rankSource = "auto";
            team.rank = null;
        }
        await team.save();
        await bugRoutes.finalizeQualification(true);

        res.json({
            message: resetToAuto ? "Bug Hunt rank returned to AUTO" : `Manual rank #${rank} saved for ${team.teamName}`,
            registrationId: id
        });
    } catch (error) {
        console.error("Manual rank error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.patch("/team/:event/:registrationId/final-place", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(decodeURIComponent(req.params.event));
        const id = clean(req.params.registrationId).toUpperCase();
        if (!event) return res.status(400).json({ message: "Unsupported event" });

        const raw = req.body?.finalPlace;
        const resetToAuto = raw === null || raw === "" || clean(raw).toLowerCase() === "auto" || Number(raw) === 0;
        const place = resetToAuto ? null : Number(raw);
        if (!resetToAuto && (!Number.isInteger(place) || place < 1)) {
            return res.status(400).json({ message: "Final place must be a positive whole number, or use AUTO" });
        }

        if (event === "Checkmate") {
            const player = await CheckmatePlayer.findOne({ registrationId: id });
            if (!player) return res.status(404).json({ message: "Checkmate player not found" });
            const playerCount = await CheckmatePlayer.countDocuments({});
            if (!resetToAuto && place > playerCount) {
                return res.status(400).json({ message: `Final place must be between 1 and ${playerCount}` });
            }
            if (!resetToAuto) {
                const duplicate = await CheckmatePlayer.findOne({ registrationId: { $ne: id }, finalPlace: place, finalPlaceSource: "manual" });
                if (duplicate) return res.status(409).json({ message: `Manual final place #${place} is already assigned to ${duplicate.playerName}` });
                player.finalPlace = place;
                player.finalPlaceSource = "manual";
            } else {
                player.finalPlace = null;
                player.finalPlaceSource = "auto";
            }
            await player.save();
            return res.json({
                message: resetToAuto ? "Checkmate final place cleared to AUTO" : `Manual final place #${place} saved`,
                registrationId: id
            });
        }

        const team = await BugHuntTeam.findOne({ registrationId: id });
        if (!team) return res.status(404).json({ message: "Team has not entered the competition yet" });
        if (team.security?.disqualified) return res.status(409).json({ message: "A disqualified team cannot receive a final place" });
        if (!(Number(team.rank) >= 1 && Number(team.rank) <= 3)) {
            return res.status(409).json({ message: "Only Bug Hunt Top 3 finalists can receive a final place" });
        }

        const finalists = await BugHuntTeam.find({ rank: { $gte: 1, $lte: 3 }, "security.disqualified": { $ne: true } });
        if (!resetToAuto && place > finalists.length) {
            return res.status(400).json({ message: `Final place must be between 1 and ${finalists.length}` });
        }
        if (!resetToAuto) {
            const duplicate = finalists.find(item => item.registrationId !== id && Number(item.finalPlace) === place && item.finalPlaceSource === "manual");
            if (duplicate) return res.status(409).json({ message: `Manual final place #${place} is already assigned to ${duplicate.teamName}` });
            team.finalPlace = place;
            team.finalPlaceSource = "manual";
        } else {
            team.finalPlace = null;
            team.finalPlaceSource = "auto";
        }
        await team.save();

        const finalFinished = finalists.every(item => item.registrationId === id
            ? Boolean(team.progress?.final?.completedAt)
            : Boolean(item.progress?.final?.completedAt));
        if (finalFinished) await bugRoutes.finalizeFinal();
        return res.json({
            message: resetToAuto ? "Bug Hunt final place returned to AUTO" : `Manual final place #${place} saved for ${team.teamName}`,
            registrationId: id
        });
    } catch (error) {
        console.error("Manual final-place error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

/* ---------------- Event start / stop / resume ---------------- */

router.get("/control/:event", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(decodeURIComponent(req.params.event));
        if (!event) return res.status(400).json({ message: "Unsupported event" });
        const control = await getEventControl(event);
        let competitionPhase = null;
        if (event === "Bug Hunt") {
            competitionPhase = await bugRoutes.competitionStatus();
        }
        res.json({
            event,
            status: control.status,
            competitionPhase,
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

        if (event === "Bug Hunt") {
            await syncBugHuntRegistrationTeams();
        }

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

async function shiftBugHuntTimers(pauseMs) {
    if (!pauseMs) return;
    const teams = await BugHuntTeam.find({});
    for (const team of teams) {
        let changed = false;
        for (const round of Object.values(team.progress || {})) {
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
            await shiftBugHuntTimers(pauseMs);
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

        const playerIds = [...new Set(matches.flatMap(match => [match.whiteRegistrationId, match.blackRegistrationId]))];
        const players = await CheckmatePlayer.find({ registrationId: { $in: playerIds } }).lean();
        const playerMap = new Map(players.map(player => [player.registrationId, player]));

        res.json(matches.map(match =>
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

        await syncCheckmatePlayers(true);

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
        const currentPhase = await bugRoutes.competitionStatus();
        res.json({
            startedAt: bugControl.startedAt,
            phase: control.status === "paused" ? "paused" : currentPhase,
            phaseEndsAt: null,
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
        if (!event) return res.status(400).json({ message: "Unsupported event" });

        if (event === "Checkmate") {
            const rows = await checkmateRows();
            return res.json(rows.map(player => ({
                registrationId: player.registrationId,
                teamName: player.playerName,
                rank: player.rank,
                rankSource: player.rankSource || "auto",
                score: player.tournamentPoints,
                finalPlace: player.finalPlace,
                status: player.currentMatch?.phase || "waiting"
            })));
        }

        const rows = await BugHuntTeam.find({}).lean();
        const mapped = rows.map(team => ({
            registrationId: team.registrationId || team.teamId,
            teamName: team.teamName,
            rank: team.rank || null,
            rankSource: team.rankSource || "auto",
            score: bugQualificationScore(team),
            finalPlace: team.finalPlace || null,
            status: team.currentRound
        }));
        mapped.sort((a, b) =>
            Number(a.finalPlace || 9999) - Number(b.finalPlace || 9999)
            || Number(a.rank || 9999) - Number(b.rank || 9999)
            || Number(b.score || 0) - Number(a.score || 0)
        );
        res.json(mapped);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

/* ---------------- Individual team restart ---------------- */
router.post("/team/:event/:registrationId/restart", requireAdmin, async (req, res) => {
    try {
        const event = normalizeEvent(decodeURIComponent(req.params.event));
        const id = clean(req.params.registrationId).toUpperCase();
        if (event !== "Bug Hunt") return res.status(400).json({ message: "Team restart is available for Bug Hunt" });

        const team = await BugHuntTeam.findOne({ registrationId: id });
        if (!team) return res.status(404).json({ message: "Competition record not found. The team may not have logged in yet." });

        const bugControl = await bugRoutes.getControl();
        if (bugControl?.finalizedAt) {
            return res.status(409).json({ message: "Bug Hunt is already finalized. Reset the complete Bug Hunt only if you want a fresh event." });
        }

        team.progress = {};
        team.currentRound = "waiting_start";
        team.currentStage = 1;
        team.qualificationScore = 0;
        team.finalScore = 0;
        team.totalHintsUsed = 0;
        team.wrongSubmissions = 0;
        team.rank = null;
        team.rankSource = "auto";
        team.finalPlace = null;
        team.finalPlaceSource = "auto";
        team.security.violations = 0;
        team.security.locked = false;
        team.security.lockReason = "";
        team.security.disqualified = false;
        team.security.events = [];
        team.markModified("progress");
        team.markModified("security");
        await team.save();

        res.json({
            message: `Bug Hunt restarted for ${id}. Scores, hints, attempts, rank and security progress were cleared.`,
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
            const approvedIds = registrations.map(item => clean(item.registrationId).toUpperCase()).filter(Boolean);
            const teams = await BugHuntTeam.find({ registrationId: { $in: approvedIds } }).lean();
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
