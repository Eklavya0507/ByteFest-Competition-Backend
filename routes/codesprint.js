const express = require("express");
const CodeSprintTeam = require("../models/CodeSprintTeam");
const questions = require("../config/codesprintQuestions");
const { requireAdmin, safeEqual: adminSafeEqual } = require("../utils/adminAuth");
const {
    createTeamToken,
    hashPassword,
    makeTeamPassword,
    requireTeam,
    safeEqual
} = require("../utils/codeSprintAuth");

const router = express.Router();
const MAX_VIOLATIONS = 4;

function clean(value) {
    return String(value ?? "").trim();
}

function normalizeAnswer(value) {
    return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function ensureProgress(team, roundKey, stageIndex) {
    team.progress = team.progress || {};
    team.progress[roundKey] = team.progress[roundKey] || {
        startedAt: null,
        completedAt: null,
        score: 0,
        hintsUsed: 0,
        stages: {}
    };
    const stageKey = `stage${stageIndex}`;
    team.progress[roundKey].stages[stageKey] = team.progress[roundKey].stages[stageKey] || {
        startedAt: null,
        completedAt: null,
        score: 0,
        attempts: 0,
        hintsUsed: [],
        lastAnswer: "",
        completionMs: null
    };
    return team.progress[roundKey].stages[stageKey];
}

function currentQuestion(team) {
    const config = questions[team.currentRound];
    if (!config) return null;
    const index = Math.max(0, Number(team.currentStage || 1) - 1);
    return { config, question: config.stages[index], index };
}

function stagePublic(question, stageProgress) {
    return {
        id: question.id,
        title: question.title,
        type: question.type,
        maxPoints: question.maxPoints,
        speedMeasured: Boolean(question.speedMeasured),
        prompt: question.prompt,
        placeholder: question.placeholder || "Enter answer",
        hints: (question.hints || []).map((hint, index) => ({
            number: index + 1,
            penalty: hint.penalty,
            used: stageProgress.hintsUsed.includes(index + 1),
            text: stageProgress.hintsUsed.includes(index + 1) ? hint.text : null,
            available: index === 0 || stageProgress.hintsUsed.includes(index)
        }))
    };
}

function roundScore(team, roundKey) {
    return Number(team.progress?.[roundKey]?.score || 0);
}

function totalCompletionMs(team) {
    let total = 0;
    for (const round of Object.values(team.progress || {})) {
        for (const stage of Object.values(round?.stages || {})) {
            if (Number.isFinite(stage?.completionMs)) total += stage.completionMs;
        }
    }
    return total;
}

function compareTeams(a, b, roundKey = null) {
    const scoreA = roundKey ? roundScore(a, roundKey) : Number(a.totalScore || 0);
    const scoreB = roundKey ? roundScore(b, roundKey) : Number(b.totalScore || 0);
    if (scoreA !== scoreB) return scoreB - scoreA;

    const hintsA = roundKey ? Number(a.progress?.[roundKey]?.hintsUsed || 0) : Number(a.totalHintsUsed || 0);
    const hintsB = roundKey ? Number(b.progress?.[roundKey]?.hintsUsed || 0) : Number(b.totalHintsUsed || 0);
    if (hintsA !== hintsB) return hintsA - hintsB;

    const timeA = roundKey
        ? Number(a.progress?.[roundKey]?.stages?.stage1?.completionMs || Number.MAX_SAFE_INTEGER)
        : totalCompletionMs(a);
    const timeB = roundKey
        ? Number(b.progress?.[roundKey]?.stages?.stage1?.completionMs || Number.MAX_SAFE_INTEGER)
        : totalCompletionMs(b);
    return timeA - timeB;
}

async function opponentFor(team) {
    if (!team.rank) return null;
    let opponentRank = null;
    if (team.currentRound === "semifinal") opponentRank = 5 - team.rank; // 1v4, 2v3
    if (team.currentRound === "wildcard") opponentRank = 13 - team.rank; // 5v8, 6v7
    if (team.currentRound === "entry_final") {
        const candidates = await CodeSprintTeam.find({ "knockout.wildcardEntryWinner": true });
        return candidates.find(item => item.teamId !== team.teamId) || null;
    }
    if (team.currentRound === "wildcard_final") {
        const candidates = await CodeSprintTeam.find({
            $or: [
                { "knockout.entryFinalWinner": true },
                { "knockout.bestSemifinalLoser": true }
            ]
        });
        return candidates.find(item => item.teamId !== team.teamId) || null;
    }
    if (opponentRank) return CodeSprintTeam.findOne({ rank: opponentRank });
    return null;
}

async function recalculateLeagueTotals() {
    const teams = await CodeSprintTeam.find({ "security.disqualified": { $ne: true } });
    for (const team of teams) {
        team.totalScore = roundScore(team, "round1") + roundScore(team, "round2") + roundScore(team, "qualifier");
        await team.save();
    }
}

async function finalizeRankingsIfReady() {
    const active = await CodeSprintTeam.find({ "security.disqualified": { $ne: true } });
    if (!active.length) return false;
    const ready = active.every(team => [
        "awaiting_ranking", "semifinal", "wildcard", "eliminated", "semifinal_loser_wait",
        "entry_final_wait", "entry_final", "wildcard_final_wait", "wildcard_final", "final_wait", "final", "completed"
    ].includes(team.currentRound));
    if (!ready) return false;

    await recalculateLeagueTotals();
    const teams = await CodeSprintTeam.find({ "security.disqualified": { $ne: true } });
    teams.sort((a, b) => {
        if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
        if (a.totalHintsUsed !== b.totalHintsUsed) return a.totalHintsUsed - b.totalHintsUsed;
        const qa = roundScore(a, "qualifier");
        const qb = roundScore(b, "qualifier");
        if (qa !== qb) return qb - qa;
        if (a.correctStages !== b.correctStages) return b.correctStages - a.correctStages;
        return totalCompletionMs(a) - totalCompletionMs(b);
    });

    for (let i = 0; i < teams.length; i += 1) {
        const team = teams[i];
        team.rank = i + 1;
        if (team.currentRound === "awaiting_ranking") {
            if (team.rank <= 4) team.currentRound = "semifinal";
            else if (team.rank <= 8) team.currentRound = "wildcard";
            else team.currentRound = "eliminated";
            team.currentStage = 1;
        }
        await team.save();
    }
    return true;
}

async function resolvePairIfReady(team, roundKey) {
    const opponent = await opponentFor(team);
    if (!opponent) return;
    const aDone = Boolean(team.progress?.[roundKey]?.completedAt);
    const bDone = Boolean(opponent.progress?.[roundKey]?.completedAt);
    if (!aDone || !bDone) return;

    const ordered = [team, opponent].sort((a, b) => compareTeams(a, b, roundKey));
    const winner = ordered[0];
    const loser = ordered[1];

    if (roundKey === "semifinal") {
        winner.knockout.semifinalWinner = true;
        winner.currentRound = "final_wait";
        loser.knockout.semifinalWinner = false;
        loser.currentRound = "semifinal_loser_wait";
    } else if (roundKey === "wildcard") {
        winner.knockout.wildcardEntryWinner = true;
        winner.currentRound = "entry_final_wait";
        loser.knockout.wildcardEntryWinner = false;
        loser.currentRound = "eliminated";
    }
    await winner.save();
    await loser.save();

    await advanceKnockoutState();
}

async function advanceKnockoutState() {
    const sfLosers = await CodeSprintTeam.find({ "knockout.semifinalWinner": false });
    if (sfLosers.length === 2 && !sfLosers.some(t => t.knockout.bestSemifinalLoser)) {
        sfLosers.sort((a, b) => compareTeams(a, b, "semifinal"));
        sfLosers[0].knockout.bestSemifinalLoser = true;
        sfLosers[0].currentRound = "wildcard_final_wait";
        sfLosers[1].currentRound = "eliminated";
        await Promise.all(sfLosers.map(t => t.save()));
    }

    const entryCandidates = await CodeSprintTeam.find({ "knockout.wildcardEntryWinner": true });
    if (entryCandidates.length === 2) {
        for (const team of entryCandidates) {
            if (team.currentRound === "entry_final_wait") {
                team.currentRound = "entry_final";
                team.currentStage = 1;
                await team.save();
            }
        }
    }

    const entryWinner = await CodeSprintTeam.findOne({ "knockout.entryFinalWinner": true });
    const bestSfLoser = await CodeSprintTeam.findOne({ "knockout.bestSemifinalLoser": true });
    if (entryWinner && bestSfLoser) {
        for (const team of [entryWinner, bestSfLoser]) {
            if (["wildcard_final_wait", "entry_final_wait"].includes(team.currentRound)) {
                team.currentRound = "wildcard_final";
                team.currentStage = 1;
                await team.save();
            }
        }
    }

    const finalWait = await CodeSprintTeam.find({ currentRound: "final_wait" });
    if (finalWait.length === 3) {
        for (const team of finalWait) {
            team.currentRound = "final";
            team.currentStage = 1;
            await team.save();
        }
    }
}

async function resolveEntryFinalIfReady() {
    const candidates = await CodeSprintTeam.find({ "knockout.wildcardEntryWinner": true });
    if (candidates.length !== 2 || !candidates.every(t => t.progress?.entry_final?.completedAt)) return;
    candidates.sort((a, b) => compareTeams(a, b, "entry_final"));
    const [winner, loser] = candidates;
    winner.knockout.entryFinalWinner = true;
    winner.currentRound = "wildcard_final_wait";
    loser.knockout.entryFinalWinner = false;
    loser.currentRound = "eliminated";
    await winner.save();
    await loser.save();
    await advanceKnockoutState();
}

async function resolveWildcardFinalIfReady() {
    const candidates = await CodeSprintTeam.find({
        $or: [
            { "knockout.entryFinalWinner": true },
            { "knockout.bestSemifinalLoser": true }
        ]
    });
    if (candidates.length !== 2 || !candidates.every(t => t.progress?.wildcard_final?.completedAt)) return;
    candidates.sort((a, b) => compareTeams(a, b, "wildcard_final"));
    const [winner, loser] = candidates;
    winner.knockout.wildcardFinalWinner = true;
    winner.currentRound = "final_wait";
    loser.knockout.wildcardFinalWinner = false;
    loser.currentRound = "eliminated";
    await winner.save();
    await loser.save();
    await advanceKnockoutState();
}

async function resolveGrandFinalIfReady() {
    const finalists = await CodeSprintTeam.find({
        $or: [
            { "knockout.semifinalWinner": true },
            { "knockout.wildcardFinalWinner": true }
        ]
    });
    if (finalists.length !== 3 || !finalists.every(t => t.progress?.final?.completedAt)) return;
    finalists.sort((a, b) => compareTeams(a, b, "final"));
    for (let i = 0; i < finalists.length; i += 1) {
        finalists[i].knockout.finalPlace = i + 1;
        finalists[i].currentRound = "completed";
        await finalists[i].save();
    }
}

async function finishRound(team, roundKey) {
    if (roundKey === "round1") {
        team.currentRound = "round2";
        team.currentStage = 1;
        await team.save();
        return;
    }
    if (roundKey === "round2") {
        team.currentRound = "qualifier";
        team.currentStage = 1;
        await team.save();
        return;
    }
    if (roundKey === "qualifier") {
        team.currentRound = "awaiting_ranking";
        team.currentStage = 1;
        await team.save();
        await finalizeRankingsIfReady();
        return;
    }
    await team.save();
    if (["semifinal", "wildcard"].includes(roundKey)) await resolvePairIfReady(team, roundKey);
    if (roundKey === "entry_final") await resolveEntryFinalIfReady();
    if (roundKey === "wildcard_final") await resolveWildcardFinalIfReady();
    if (roundKey === "final") await resolveGrandFinalIfReady();
}

router.post("/login", async (req, res) => {
    try {
        const teamId = clean(req.body.teamId).toUpperCase();
        const password = clean(req.body.password);
        const team = await CodeSprintTeam.findOne({ teamId });
        if (!team || !safeEqual(team.passwordHash, hashPassword(password))) {
            return res.status(401).json({ message: "Invalid Team ID or password" });
        }
        if (team.security?.disqualified) return res.status(403).json({ message: "This team is disqualified" });
        return res.json({ token: createTeamToken(team), teamId: team.teamId, teamName: team.teamName });
    } catch (error) {
        console.error("Code Sprint login error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});

router.get("/state", requireTeam, async (req, res) => {
    try {
        const team = req.codeSprintTeam;
        const opponent = await opponentFor(team);
        const config = questions[team.currentRound];
        const stages = config?.stages || [];
        const current = config ? ensureProgress(team, team.currentRound, team.currentStage) : null;
        if (config) {
            team.markModified("progress");
            await team.save();
        }
        return res.json({
            teamId: team.teamId,
            teamName: team.teamName,
            members: team.members,
            currentRound: team.currentRound,
            currentStage: team.currentStage,
            roundTitle: config?.title || "",
            stageCount: stages.length,
            totalScore: team.totalScore,
            round1Score: roundScore(team, "round1"),
            round2Score: roundScore(team, "round2"),
            qualifierScore: roundScore(team, "qualifier"),
            currentRoundScore: roundScore(team, team.currentRound),
            rank: team.rank,
            opponent: opponent ? { teamId: opponent.teamId, teamName: opponent.teamName, rank: opponent.rank } : null,
            security: {
                violations: team.security?.violations || 0,
                maxViolations: MAX_VIOLATIONS,
                locked: Boolean(team.security?.locked),
                lockReason: team.security?.lockReason || "",
                disqualified: Boolean(team.security?.disqualified)
            },
            currentStageStartedAt: current?.startedAt || null,
            roundStartedAt: team.progress?.[team.currentRound]?.startedAt || null,
            timeLimitSeconds: config?.timeLimitSeconds || null,
            finalPlace: team.knockout?.finalPlace || null
        });
    } catch (error) {
        console.error("Code Sprint state error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});

router.get("/question", requireTeam, async (req, res) => {
    try {
        const team = req.codeSprintTeam;
        if (team.security?.disqualified) return res.status(403).json({ message: "Team is disqualified" });
        if (team.security?.locked) return res.status(423).json({ message: "Competition is locked", locked: true });
        const current = currentQuestion(team);
        if (!current?.question) return res.status(409).json({ message: "No active challenge for this team" });

        const stageProgress = ensureProgress(team, team.currentRound, team.currentStage);
        const now = new Date();
        if (!team.progress[team.currentRound].startedAt) team.progress[team.currentRound].startedAt = now;
        if (!stageProgress.startedAt) stageProgress.startedAt = now;
        team.markModified("progress");
        await team.save();

        return res.json({
            round: team.currentRound,
            roundTitle: current.config.title,
            stage: team.currentStage,
            stageCount: current.config.stages.length,
            roundStartedAt: team.progress[team.currentRound].startedAt,
            stageStartedAt: stageProgress.startedAt,
            timeLimitSeconds: current.config.timeLimitSeconds,
            question: stagePublic(current.question, stageProgress)
        });
    } catch (error) {
        console.error("Code Sprint question error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});

router.post("/hint/:number", requireTeam, async (req, res) => {
    try {
        const team = req.codeSprintTeam;
        if (team.security?.disqualified) return res.status(403).json({ message: "Team is disqualified" });
        if (team.security?.locked) return res.status(423).json({ message: "Competition is locked" });
        const current = currentQuestion(team);
        if (!current?.question) return res.status(409).json({ message: "No active challenge" });

        const number = Number(req.params.number);
        const hint = current.question.hints?.[number - 1];
        if (!hint) return res.status(404).json({ message: "Hint not found" });

        const stageProgress = ensureProgress(team, team.currentRound, team.currentStage);
        if (number > 1 && !stageProgress.hintsUsed.includes(number - 1)) {
            return res.status(409).json({ message: `Use Hint ${number - 1} first` });
        }

        const alreadyUsed = stageProgress.hintsUsed.includes(number);
        if (!alreadyUsed) {
            stageProgress.hintsUsed.push(number);
            team.progress[team.currentRound].hintsUsed += 1;
            team.totalHintsUsed += 1;
            team.markModified("progress");
            await team.save();
        }

        return res.json({
            number,
            text: hint.text,
            penalty: hint.penalty,
            chargedNow: !alreadyUsed,
            message: alreadyUsed ? "Hint opened again. No extra penalty." : `${hint.penalty} points will be deducted if this stage is solved.`
        });
    } catch (error) {
        console.error("Code Sprint hint error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});

router.post("/submit", requireTeam, async (req, res) => {
    try {
        const team = req.codeSprintTeam;
        if (team.security?.disqualified) return res.status(403).json({ message: "Team is disqualified" });
        if (team.security?.locked) return res.status(423).json({ message: "Competition is locked" });
        const current = currentQuestion(team);
        if (!current?.question) return res.status(409).json({ message: "No active challenge" });

        const answer = clean(req.body.answer);
        if (!answer) return res.status(400).json({ message: "Enter an answer before submitting" });

        const stageProgress = ensureProgress(team, team.currentRound, team.currentStage);
        if (stageProgress.completedAt) return res.status(409).json({ message: "This stage is already completed" });

        stageProgress.attempts += 1;
        stageProgress.lastAnswer = answer;
        const accepted = current.question.answers.some(item => normalizeAnswer(item) === normalizeAnswer(answer));

        if (!accepted) {
            team.markModified("progress");
            await team.save();
            return res.json({ correct: false, attempts: stageProgress.attempts, message: "Answer not accepted. Try again." });
        }

        const totalPenalty = stageProgress.hintsUsed.reduce((sum, number) => {
            return sum + Number(current.question.hints?.[number - 1]?.penalty || 0);
        }, 0);
        const earned = Math.max(0, Number(current.question.maxPoints || 0) - totalPenalty);
        const completedAt = new Date();
        stageProgress.completedAt = completedAt;
        stageProgress.score = earned;
        stageProgress.completionMs = stageProgress.startedAt
            ? completedAt.getTime() - new Date(stageProgress.startedAt).getTime()
            : null;
        team.progress[team.currentRound].score += earned;
        team.totalScore += earned;
        team.correctStages += 1;

        const stageCount = current.config.stages.length;
        const completedRound = team.currentStage >= stageCount;
        if (!completedRound) {
            team.currentStage += 1;
            ensureProgress(team, team.currentRound, team.currentStage);
            team.markModified("progress");
            await team.save();
            return res.json({
                correct: true,
                earned,
                completedRound: false,
                nextStage: team.currentStage,
                message: `Correct. +${earned} points. Stage ${team.currentStage} is ready.`
            });
        }

        team.progress[team.currentRound].completedAt = completedAt;
        team.markModified("progress");
        const finishedRound = team.currentRound;
        await finishRound(team, finishedRound);
        return res.json({
            correct: true,
            earned,
            completedRound: true,
            finishedRound,
            nextRound: team.currentRound,
            message: `Correct. +${earned} points. ${current.config.title} completed.`
        });
    } catch (error) {
        console.error("Code Sprint submit error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});

router.post("/security/violation", requireTeam, async (req, res) => {
    try {
        const team = req.codeSprintTeam;
        if (team.security?.disqualified) return res.status(403).json({ message: "Team is disqualified" });
        if (team.security?.locked) {
            return res.json({
                locked: true,
                violations: team.security.violations,
                maxViolations: MAX_VIOLATIONS,
                message: "Competition is already locked"
            });
        }

        // At the fourth violation the coordinator decides Resume or Disqualify.
        // We do not auto-disqualify because accidental fullscreen exits can happen.
        team.security.violations = Math.min(MAX_VIOLATIONS, (team.security.violations || 0) + 1);
        team.security.locked = true;
        team.security.lockReason = clean(req.body.reason) || "Competition window lost focus";
        team.security.events.push({
            reason: team.security.lockReason,
            detail: clean(req.body.detail),
            at: new Date()
        });
        await team.save();

        return res.json({
            locked: true,
            violations: team.security.violations,
            maxViolations: MAX_VIOLATIONS,
            coordinatorDecisionRequired: team.security.violations >= MAX_VIOLATIONS,
            message: team.security.violations >= MAX_VIOLATIONS
                ? "Security limit reached. Coordinator must decide whether to resume or disqualify."
                : `Security violation ${team.security.violations}/${MAX_VIOLATIONS}. Coordinator password required.`
        });
    } catch (error) {
        console.error("Security violation error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});

router.post("/security/unlock", requireTeam, async (req, res) => {
    try {
        const team = req.codeSprintTeam;
        const password = clean(req.body.password);
        const action = clean(req.body.action || "resume").toLowerCase();
        const required = String(process.env.CODESPRINT_COORDINATOR_PASSWORD || "");
        if (!required) return res.status(503).json({ message: "Coordinator password is not configured" });
        if (!adminSafeEqual(password, required)) return res.status(403).json({ message: "Incorrect coordinator password" });
        if (!team.security?.locked) return res.json({ unlocked: true, message: "Team is already unlocked" });

        if (team.security.violations >= MAX_VIOLATIONS && action === "disqualify") {
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
        return res.json({
            unlocked: true,
            violations: team.security.violations,
            maxViolations: MAX_VIOLATIONS,
            message: "Competition unlocked. Return to fullscreen to continue."
        });
    } catch (error) {
        console.error("Security unlock error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});

// ---------------- ADMIN / ORGANIZER ----------------
router.get("/admin/teams", requireAdmin, async (req, res) => {
    try {
        const teams = await CodeSprintTeam.find().sort({ rank: 1, teamId: 1 });
        return res.json(teams.map(team => ({
            teamId: team.teamId,
            teamName: team.teamName,
            registrationId: team.registrationId,
            password: makeTeamPassword(team.teamName, team.teamId),
            members: team.members,
            currentRound: team.currentRound,
            currentStage: team.currentStage,
            round1: roundScore(team, "round1"),
            round2: roundScore(team, "round2"),
            qualifier: roundScore(team, "qualifier"),
            totalScore: team.totalScore,
            hints: team.totalHintsUsed,
            rank: team.rank,
            violations: team.security?.violations || 0,
            locked: Boolean(team.security?.locked),
            disqualified: Boolean(team.security?.disqualified),
            finalPlace: team.knockout?.finalPlace || null
        })));
    } catch (error) {
        console.error("Code Sprint admin team list error:", error);
        return res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
