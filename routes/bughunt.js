const express = require("express");
const BugHuntTeam = require("../models/BugHuntTeam");
const BugHuntControl = require("../models/BugHuntControl");
const EventControl = require("../models/EventControl");
const questions = require("../config/bughuntQuestions");
const { requireTeam, createCoordinatorGrant, verifyCoordinatorGrant } = require("../utils/bugHuntAuth");
const { safeEqual } = require("../utils/competitionPassword");

const router = express.Router();
const MAX_VIOLATIONS = 4;
const WRONG_ATTEMPT_PENALTY = 5;
const ORDER = ["round1", "round2", "round3", "surprise"];
const clean = value => String(value ?? "").trim();
const normalize = value => clean(value).replace(/\s+/g, " ").toLowerCase();

function ensureRound(team, key) {
    team.progress = team.progress || {};
    team.progress[key] = team.progress[key] || {
        score: 0,
        hintsUsed: 0,
        wrongSubmissions: 0,
        startedAt: null,
        completedAt: null,
        stages: {}
    };
    return team.progress[key];
}

function ensureStage(team, key, index) {
    const round = ensureRound(team, key);
    const stageKey = `stage${index}`;
    round.stages[stageKey] = round.stages[stageKey] || {
        startedAt: null,
        completedAt: null,
        score: 0,
        attempts: 0,
        hintsUsed: [],
        lastAnswer: "",
        completionMs: null
    };
    return round.stages[stageKey];
}

const roundScore = (team, key) => Number(team.progress?.[key]?.score || 0);
const qualificationScore = team => ORDER.reduce((sum, key) => sum + roundScore(team, key), 0);

/*
 * v11 Bug Hunt flow is TEAM-PROGRESS based, not one global round clock.
 * Example: Team D may be on Surprise while A/B/C are still on Round 3.
 * The event control still starts/pauses the competition for everyone, while
 * each team's round timer starts when that team enters that round.
 */
function phaseFrom(control) {
    if (!control?.startedAt) return { key: "waiting_start", endsAt: null };
    if (control?.finalizedAt) return { key: "completed", endsAt: null };
    return { key: "team_progress", endsAt: null };
}

async function getControl() {
    let control = await BugHuntControl.findOne({ key: "bughunt" });
    if (!control) control = await BugHuntControl.create({ key: "bughunt" });
    return control;
}

async function getEventControl() {
    let control = await EventControl.findOne({ event: "Bug Hunt" });
    if (!control) control = await EventControl.create({ event: "Bug Hunt" });
    return control;
}

function totalCompletion(team, key) {
    const stages = Object.values(team.progress?.[key]?.stages || {});
    return stages.reduce((sum, stage) => sum + (Number.isFinite(stage?.completionMs) ? stage.completionMs : 0), 0) || Number.MAX_SAFE_INTEGER;
}

function compareQualification(a, b) {
    return qualificationScore(b) - qualificationScore(a)
        || Number(a.totalHintsUsed || 0) - Number(b.totalHintsUsed || 0)
        || roundScore(b, "surprise") - roundScore(a, "surprise")
        || roundScore(b, "round3") - roundScore(a, "round3")
        || Number(a.wrongSubmissions || 0) - Number(b.wrongSubmissions || 0)
        || totalCompletion(a, "surprise") - totalCompletion(b, "surprise");
}

function compareFinal(a, b) {
    return roundScore(b, "final") - roundScore(a, "final")
        || Number(a.progress?.final?.hintsUsed || 0) - Number(b.progress?.final?.hintsUsed || 0)
        || Number(a.progress?.final?.wrongSubmissions || 0) - Number(b.progress?.final?.wrongSubmissions || 0)
        || totalCompletion(a, "final") - totalCompletion(b, "final")
        || qualificationScore(b) - qualificationScore(a);
}

function assignRanksRespectingManual(teams, sourceField, valueField, comparator) {
    const used = new Set(
        teams
            .filter(team => team[sourceField] === "manual" && Number.isInteger(Number(team[valueField])) && Number(team[valueField]) > 0)
            .map(team => Number(team[valueField]))
    );
    const automatic = teams.filter(team => team[sourceField] !== "manual").sort(comparator);
    let next = 1;
    for (const team of automatic) {
        while (used.has(next)) next += 1;
        team[valueField] = next;
        team[sourceField] = "auto";
        next += 1;
    }
}

function startRound(team, key, at = new Date()) {
    team.currentRound = key;
    team.currentStage = 1;
    const round = ensureRound(team, key);
    if (!round.startedAt) round.startedAt = at;
    const stage = ensureStage(team, key, 1);
    if (!stage.startedAt) stage.startedAt = at;
    team.markModified("progress");
}

function roundEndsAt(team, key = team.currentRound) {
    const config = questions[key];
    const startedAt = team.progress?.[key]?.startedAt;
    const durationSeconds = Number(config?.durationSeconds || 0);
    if (!startedAt || !durationSeconds) return null;
    return new Date(new Date(startedAt).getTime() + durationSeconds * 1000);
}

function finishRoundAndAdvance(team, key, at = new Date()) {
    const round = ensureRound(team, key);
    if (!round.completedAt) round.completedAt = at;

    if (key === "final") {
        team.markModified("progress");
        return;
    }

    if (key === "surprise") {
        team.currentRound = "awaiting_ranking";
        team.currentStage = 1;
        team.markModified("progress");
        return;
    }

    const index = ORDER.indexOf(key);
    const next = ORDER[index + 1];
    if (next) startRound(team, next, at);
}

async function qualificationReadiness() {
    const teams = await BugHuntTeam.find({});
    const active = teams.filter(team => !team.security?.disqualified);
    const pending = active.filter(team => {
        if (["awaiting_ranking", "final", "eliminated", "completed"].includes(team.currentRound)) return false;
        return !team.progress?.surprise?.completedAt;
    });
    return {
        totalTeams: teams.length,
        activeTeams: active.length,
        readyTeams: active.length - pending.length,
        pendingTeams: pending.map(team => ({ registrationId: team.registrationId, currentRound: team.currentRound, currentStage: team.currentStage })),
        allReady: active.length > 0 && pending.length === 0
    };
}

async function finalizeQualification(force = false) {
    const readiness = await qualificationReadiness();
    if (!force && !readiness.allReady) return false;

    const teams = await BugHuntTeam.find({ "security.disqualified": { $ne: true } });
    if (!teams.length) return false;

    for (const team of teams) team.qualificationScore = qualificationScore(team);
    assignRanksRespectingManual(teams, "rankSource", "rank", compareQualification);

    const finalStart = new Date();
    for (const team of teams) {
        if (Number(team.rank) <= 3) {
            const alreadyInFinal = team.currentRound === "final" || team.currentRound === "completed";
            if (!alreadyInFinal) startRound(team, "final", finalStart);
        } else {
            team.currentRound = "eliminated";
            team.currentStage = 1;
        }
        team.markModified("progress");
    }
    await Promise.all(teams.map(team => team.save()));
    return true;
}

async function finalizeFinal() {
    const finalists = await BugHuntTeam.find({
        rank: { $gte: 1, $lte: 3 },
        "security.disqualified": { $ne: true }
    });
    if (!finalists.length) return false;

    assignRanksRespectingManual(finalists, "finalPlaceSource", "finalPlace", compareFinal);
    for (const team of finalists) {
        team.finalScore = roundScore(team, "final");
        team.currentRound = "completed";
        team.currentStage = 1;
    }
    await Promise.all(finalists.map(team => team.save()));
    await BugHuntControl.updateOne({ key: "bughunt" }, { $set: { finalizedAt: new Date() } });
    return true;
}

async function maybeFinalizeQualification() {
    const readiness = await qualificationReadiness();
    if (!readiness.allReady) return false;
    const alreadyQualified = await BugHuntTeam.exists({
        "security.disqualified": { $ne: true },
        rank: { $ne: null },
        currentRound: { $in: ["final", "eliminated", "completed"] }
    });
    if (alreadyQualified) return true;
    return finalizeQualification(true);
}

async function maybeFinalizeFinal() {
    const finalists = await BugHuntTeam.find({
        rank: { $gte: 1, $lte: 3 },
        "security.disqualified": { $ne: true }
    });
    if (!finalists.length) return false;
    if (!finalists.every(team => Boolean(team.progress?.final?.completedAt))) return false;
    return finalizeFinal();
}

async function competitionStatus() {
    const control = await getControl();
    if (!control.startedAt) return "waiting_start";
    if (control.finalizedAt) return "completed";

    const teams = await BugHuntTeam.find({ "security.disqualified": { $ne: true } }).lean();
    if (!teams.length) return "waiting_for_teams";
    if (teams.some(team => ["final", "completed"].includes(team.currentRound))) return "final";
    if (teams.some(team => team.currentRound === "awaiting_ranking")) return "qualification_wait";
    return "team_progress";
}

async function syncTeam(team) {
    const [control, eventControl] = await Promise.all([getControl(), getEventControl()]);

    if (eventControl.status === "not_started") {
        return { control, eventControl, phase: { key: "waiting_start", endsAt: null } };
    }

    if (eventControl.status === "paused") {
        return { control, eventControl, phase: { key: team.currentRound, endsAt: null } };
    }

    if (team.security?.disqualified || ["eliminated", "completed"].includes(team.currentRound)) {
        return { control, eventControl, phase: { key: team.currentRound, endsAt: null } };
    }

    let changed = false;
    if (team.currentRound === "waiting_start") {
        startRound(team, "round1", new Date());
        changed = true;
    }

    if ([...ORDER, "final"].includes(team.currentRound)) {
        const round = ensureRound(team, team.currentRound);
        if (!round.startedAt) {
            startRound(team, team.currentRound, new Date());
            changed = true;
        }

        const end = roundEndsAt(team, team.currentRound);
        if (end && Date.now() >= end.getTime() && !round.completedAt) {
            finishRoundAndAdvance(team, team.currentRound, end);
            changed = true;
        }
    }

    if (changed) await team.save();

    if (team.currentRound === "awaiting_ranking") {
        await maybeFinalizeQualification();
    } else if (team.currentRound === "final" && team.progress?.final?.completedAt) {
        await maybeFinalizeFinal();
    }

    if (changed || team.currentRound === "awaiting_ranking" || team.currentRound === "final") {
        const fresh = await BugHuntTeam.findById(team._id);
        if (fresh) team = fresh;
    }

    return {
        control,
        eventControl,
        phase: {
            key: team.currentRound,
            endsAt: eventControl.status === "running" ? roundEndsAt(team, team.currentRound) : null
        },
        team
    };
}

function stagePublic(question, progress) {
    return {
        id: question.id,
        title: question.title,
        type: "patch-challenge",
        maxPoints: question.maxPoints,
        prompt: question.prompt,
        ui: question.ui || null,
        attempts: Number(progress.attempts || 0),
        wrongPenaltyEach: WRONG_ATTEMPT_PENALTY,
        hints: (question.hints || []).map((hint, index) => ({
            number: index + 1,
            penalty: hint.penalty,
            used: progress.hintsUsed.includes(index + 1),
            text: progress.hintsUsed.includes(index + 1) ? hint.text : null,
            available: true
        }))
    };
}

router.get("/state", requireTeam, async (req, res) => {
    try {
        let team = req.bugHuntTeam;
        const synced = await syncTeam(team);
        team = synced.team || team;
        const config = questions[team.currentRound];
        const readiness = team.currentRound === "awaiting_ranking" ? await qualificationReadiness() : null;
        res.json({
            teamId: team.teamId,
            registrationId: team.registrationId,
            teamName: team.teamName,
            members: team.members,
            currentRound: team.currentRound,
            currentStage: team.currentStage,
            roundTitle: config?.title || "",
            stageCount: config?.stages?.length || 0,
            qualificationScore: qualificationScore(team),
            currentRoundScore: roundScore(team, team.currentRound),
            finalScore: roundScore(team, "final"),
            rank: team.rank,
            rankSource: team.rankSource || "auto",
            finalPlace: team.finalPlace,
            finalPlaceSource: team.finalPlaceSource || "auto",
            qualificationWait: readiness ? {
                readyTeams: readiness.readyTeams,
                activeTeams: readiness.activeTeams,
                pendingTeams: readiness.pendingTeams.length
            } : null,
            security: {
                violations: team.security?.violations || 0,
                maxViolations: MAX_VIOLATIONS,
                locked: Boolean(team.security?.locked),
                lockReason: team.security?.lockReason || "",
                disqualified: Boolean(team.security?.disqualified)
            },
            eventStatus: synced.eventControl.status,
            eventStartedAt: synced.control.startedAt,
            phaseEndsAt: synced.phase.endsAt
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/question", requireTeam, async (req, res) => {
    try {
        let team = req.bugHuntTeam;
        const synced = await syncTeam(team);
        team = synced.team || team;
        if (synced.eventControl.status === "not_started") return res.status(409).json({ message: "Bug Hunt has not started yet" });
        if (synced.eventControl.status === "paused") return res.status(423).json({ message: "Bug Hunt is paused by the coordinator", locked: true, eventPaused: true });
        if (team.security?.disqualified) return res.status(403).json({ message: "Team is disqualified" });
        if (team.security?.locked) return res.status(423).json({ message: "Competition is locked", locked: true });

        const expectedRound = clean(req.query?.round);
        if (expectedRound && team.currentRound !== expectedRound) {
            return res.status(409).json({ message: "Your team has moved to the next level", currentRound: team.currentRound });
        }
        if (!questions[team.currentRound]) {
            return res.status(409).json({
                message: team.currentRound === "awaiting_ranking"
                    ? "Surprise completed. Wait for the remaining active teams to finish."
                    : team.currentRound === "eliminated"
                        ? "Qualification completed. This team is eliminated."
                        : team.currentRound === "completed"
                            ? "Bug Hunt is completed."
                            : "No active challenge"
            });
        }

        const config = questions[team.currentRound];
        const question = config.stages[team.currentStage - 1];
        if (!question) return res.status(409).json({ message: "Round completed. Waiting for next level." });

        const progress = ensureStage(team, team.currentRound, team.currentStage);
        if (!progress.startedAt) progress.startedAt = new Date();
        if (!team.progress[team.currentRound].startedAt) team.progress[team.currentRound].startedAt = new Date();
        team.markModified("progress");
        await team.save();

        res.json({
            round: team.currentRound,
            roundTitle: config.title,
            stage: team.currentStage,
            stageCount: config.stages.length,
            phaseEndsAt: roundEndsAt(team, team.currentRound),
            question: stagePublic(question, progress)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/hint/:number", requireTeam, async (req, res) => {
    try {
        let team = req.bugHuntTeam;
        const synced = await syncTeam(team);
        team = synced.team || team;
        if (synced.eventControl.status === "not_started") return res.status(409).json({ message: "Bug Hunt has not started yet" });
        if (synced.eventControl.status === "paused") return res.status(423).json({ message: "Bug Hunt is paused by the coordinator" });
        if (team.security?.disqualified) return res.status(403).json({ message: "Team is disqualified" });
        if (team.security?.locked) return res.status(423).json({ message: "Competition is locked" });

        const expectedRound = clean(req.query?.round);
        if (expectedRound && team.currentRound !== expectedRound) {
            return res.status(409).json({ message: "Your team has moved to the next level", currentRound: team.currentRound });
        }

        const config = questions[team.currentRound];
        const question = config?.stages?.[team.currentStage - 1];
        if (!question) return res.status(409).json({ message: "No active challenge" });

        const number = Number(req.params.number);
        const hint = question.hints?.[number - 1];
        if (!hint) return res.status(404).json({ message: "Hint not found" });

        const progress = ensureStage(team, team.currentRound, team.currentStage);
        const used = progress.hintsUsed.includes(number);
        if (!used) {
            progress.hintsUsed.push(number);
            team.progress[team.currentRound].hintsUsed += 1;
            team.totalHintsUsed += 1;
            team.markModified("progress");
            await team.save();
        }

        res.json({ number, text: hint.text, penalty: hint.penalty, chargedNow: !used });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/run", requireTeam, async (req, res) => {
    try {
        let team = req.bugHuntTeam;
        const synced = await syncTeam(team);
        team = synced.team || team;
        if (synced.eventControl.status !== "running") return res.status(409).json({ message: "Bug Hunt is not running" });
        if (team.security?.disqualified) return res.status(403).json({ message: "Team is disqualified" });
        if (team.security?.locked) return res.status(423).json({ message: "Competition is locked" });
        const config = questions[team.currentRound];
        const question = config?.stages?.[team.currentStage - 1];
        if (!question) return res.status(409).json({ message: "No active challenge" });
        const patch = clean(req.body?.patch);
        const preview = typeof question.run === "function" ? question.run(patch) : { output: "Sample run completed.", note: "No expected output is shown." };
        return res.json({ output: preview.output || "", note: preview.note || "Sample execution only. Hidden tests are checked only on submission." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/submit", requireTeam, async (req, res) => {
    try {
        let team = req.bugHuntTeam;
        const synced = await syncTeam(team);
        team = synced.team || team;
        if (synced.eventControl.status === "not_started") return res.status(409).json({ message: "Bug Hunt has not started yet" });
        if (synced.eventControl.status === "paused") return res.status(423).json({ message: "Bug Hunt is paused by the coordinator" });
        if (team.security?.disqualified) return res.status(403).json({ message: "Team is disqualified" });
        if (team.security?.locked) return res.status(423).json({ message: "Competition is locked" });

        const expectedRound = clean(req.body?.round);
        if (expectedRound && team.currentRound !== expectedRound) {
            return res.status(409).json({ message: "Your team has moved to the next level", currentRound: team.currentRound });
        }

        const config = questions[team.currentRound];
        const question = config?.stages?.[team.currentStage - 1];
        if (!question) return res.status(409).json({ message: "No active challenge" });

        const patch = clean(req.body?.patch ?? req.body?.answer);
        if (!patch) return res.status(400).json({ message: "Edit the code and submit your patch" });

        const progress = ensureStage(team, team.currentRound, team.currentStage);
        if (progress.completedAt) return res.status(409).json({ message: "Stage already completed" });

        progress.attempts += 1;
        progress.lastAnswer = patch;
        const evaluation = typeof question.evaluate === "function"
            ? question.evaluate(patch)
            : { correct: false, passed: 0, total: 4 };
        const passed = Math.max(0, Number(evaluation?.passed || 0));
        const total = Math.max(1, Number(evaluation?.total || 4));

        if (!evaluation?.correct) {
            team.wrongSubmissions += 1;
            ensureRound(team, team.currentRound).wrongSubmissions += 1;
            team.markModified("progress");
            await team.save();
            return res.json({
                correct: false,
                stageFailed: false,
                passed,
                total,
                attempts: progress.attempts,
                penaltyToDate: progress.attempts * WRONG_ATTEMPT_PENALTY,
                message: `${passed}/${total} hidden tests passed. Patch rejected. -${WRONG_ATTEMPT_PENALTY} potential points. You may keep trying while the round timer is active.`
            });
        }

        const hintPenalty = progress.hintsUsed.reduce((sum, number) => sum + Number(question.hints?.[number - 1]?.penalty || 0), 0);
        const wrongPenalty = Math.max(0, progress.attempts - 1) * WRONG_ATTEMPT_PENALTY;
        const earned = Math.max(5, Number(question.maxPoints || 0) - hintPenalty - wrongPenalty);
        const completedAt = new Date();
        const finishedRound = team.currentRound;
        progress.completedAt = completedAt;
        progress.score = earned;
        progress.completionMs = progress.startedAt ? completedAt - new Date(progress.startedAt) : null;
        team.progress[finishedRound].score += earned;

        const stageCount = config.stages.length;
        const completedRound = team.currentStage >= stageCount;
        if (!completedRound) {
            team.currentStage += 1;
            const nextStage = ensureStage(team, team.currentRound, team.currentStage);
            if (!nextStage.startedAt) nextStage.startedAt = completedAt;
        } else {
            finishRoundAndAdvance(team, finishedRound, completedAt);
        }

        team.qualificationScore = qualificationScore(team);
        team.markModified("progress");
        await team.save();

        if (finishedRound === "surprise" && completedRound) await maybeFinalizeQualification();
        else if (finishedRound === "final" && completedRound) await maybeFinalizeFinal();

        const fresh = await BugHuntTeam.findById(team._id);
        const currentRound = fresh?.currentRound || team.currentRound;
        let message = `Patch accepted. ${total}/${total} hidden tests passed. +${earned} points.`;
        if (!completedRound) message += ` Stage ${fresh?.currentStage || team.currentStage} is ready.`;
        else if (finishedRound === "surprise") message += currentRound === "final" ? " Qualification complete — your team reached the Final." : currentRound === "eliminated" ? " Qualification complete." : " Waiting for remaining active teams.";
        else if (finishedRound === "final") message += currentRound === "completed" ? " Final result saved." : " Waiting for other finalists.";
        else message += ` ${questions[currentRound]?.title || "Next round"} is ready.`;

        return res.json({ correct: true, earned, passed: total, total, completedRound, nextStage: fresh?.currentStage || team.currentStage, currentRound, message });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/security/violation", requireTeam, async (req, res) => {
    try {
        const team = req.bugHuntTeam;
        if (team.security?.disqualified) return res.status(403).json({ message: "Team is disqualified" });
        if (team.security?.locked) {
            return res.json({ locked: true, violations: team.security.violations, maxViolations: MAX_VIOLATIONS });
        }
        team.security.violations = Math.min(MAX_VIOLATIONS, (team.security.violations || 0) + 1);
        team.security.locked = true;
        team.security.lockReason = clean(req.body?.reason) || "Competition window lost focus";
        team.security.events.push({
            reason: team.security.lockReason,
            detail: clean(req.body?.detail),
            at: new Date()
        });
        await team.save();
        res.json({
            locked: true,
            violations: team.security.violations,
            maxViolations: MAX_VIOLATIONS,
            coordinatorDecisionRequired: team.security.violations >= MAX_VIOLATIONS
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/security/unlock", requireTeam, async (req, res) => {
    try {
        const team = req.bugHuntTeam;
        const required = String(process.env.BUGHUNT_COORDINATOR_PASSWORD || process.env.COMPETITION_COORDINATOR_PASSWORD || "");
        const action = clean(req.body?.action || "resume").toLowerCase();
        const suppliedPassword = clean(req.body?.password);
        const suppliedGrant = clean(req.body?.grant);
        const grantValid = verifyCoordinatorGrant(suppliedGrant, team);
        const passwordValid = Boolean(required) && safeEqual(suppliedPassword, required);

        if (!required && !grantValid) {
            return res.status(503).json({ message: "BUGHUNT_COORDINATOR_PASSWORD is not configured" });
        }

        // A saved coordinator grant can resume later locks in the same browser session.
        // Disqualification always requires the actual coordinator password.
        if (action === "disqualify") {
            if (!passwordValid) return res.status(403).json({ message: "Coordinator password is required to disqualify" });
        } else if (!passwordValid && !grantValid) {
            return res.status(403).json({ message: "Incorrect coordinator password" });
        }

        if (action === "disqualify" && team.security.violations >= MAX_VIOLATIONS) {
            team.security.disqualified = true;
            team.security.locked = true;
            team.currentRound = "eliminated";
            await team.save();
            return res.json({ disqualified: true, message: "Team disqualified by coordinator" });
        }

        team.security.locked = false;
        team.security.lockReason = "";
        const last = team.security.events[team.security.events.length - 1];
        if (last) {
            last.unlockedAt = new Date();
            last.unlockedBy = "coordinator";
        }
        await team.save();
        res.json({
            unlocked: true,
            violations: team.security.violations,
            maxViolations: MAX_VIOLATIONS,
            unlockGrant: createCoordinatorGrant(team),
            coordinatorSession: true
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = {
    router,
    getControl,
    phaseFrom,
    finalizeQualification,
    finalizeFinal,
    qualificationReadiness,
    competitionStatus,
    qualificationScore,
    compareQualification,
    compareFinal
};
