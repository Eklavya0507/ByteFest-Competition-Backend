const CheckmatePlayer = require("../models/CheckmatePlayer");
const CheckmateMatch = require("../models/CheckmateMatch");

const PIECE_VALUES = Object.freeze({
    pawn: 1,
    knight: 3,
    bishop: 3,
    rook: 5,
    queen: 9
});

const CAPTURE_LIMITS = Object.freeze({
    pawn: 8,
    knight: 2,
    bishop: 2,
    rook: 2,
    queen: 1
});

const LEAGUE_PHASES = new Set(["round1", "round2", "round3"]);

function clean(value) {
    return String(value ?? "").trim();
}

function fullMoves(match) {
    return Math.min(Number(match.whiteMoves || 0), Number(match.blackMoves || 0));
}

function derivedTimes(match, now = Date.now()) {
    let white = Number(match.whiteTimeMs || 0);
    let black = Number(match.blackTimeMs || 0);

    if (match.status === "running" && match.turnStartedAt && match.activeColor) {
        const elapsed = Math.max(0, now - new Date(match.turnStartedAt).getTime());
        if (match.activeColor === "white") white = Math.max(0, white - elapsed);
        else black = Math.max(0, black - elapsed);
    }

    return { whiteTimeMs: white, blackTimeMs: black };
}

function commitElapsed(match, now = Date.now()) {
    if (match.status !== "running" || !match.turnStartedAt || !match.activeColor) return;

    const elapsed = Math.max(0, now - new Date(match.turnStartedAt).getTime());
    if (match.activeColor === "white") match.whiteTimeMs = Math.max(0, Number(match.whiteTimeMs || 0) - elapsed);
    else match.blackTimeMs = Math.max(0, Number(match.blackTimeMs || 0) - elapsed);

    match.turnStartedAt = new Date(now);
}

async function refreshRanks() {
    const players = await CheckmatePlayer.find({});
    players.sort((a, b) => {
        if (a.tournamentPoints !== b.tournamentPoints) return b.tournamentPoints - a.tournamentPoints;
        if (a.wins !== b.wins) return b.wins - a.wins;
        const diffA = Number(a.materialFor || 0) - Number(a.materialAgainst || 0);
        const diffB = Number(b.materialFor || 0) - Number(b.materialAgainst || 0);
        if (diffA !== diffB) return diffB - diffA;
        return Number(a.totalMoves || 0) - Number(b.totalMoves || 0);
    });

    for (let index = 0; index < players.length; index += 1) {
        players[index].rank = index + 1;
        await players[index].save();
    }
}

async function applyResultToPlayers(match) {
    if (match.resultApplied) return;

    const [white, black] = await Promise.all([
        CheckmatePlayer.findOne({ registrationId: match.whiteRegistrationId }),
        CheckmatePlayer.findOne({ registrationId: match.blackRegistrationId })
    ]);

    if (!white || !black) throw new Error("Checkmate player account missing");

    const league = LEAGUE_PHASES.has(match.phase);

    if (match.result === "white_win") {
        white.wins += 1;
        black.losses += 1;
        if (league) white.tournamentPoints += 1;
    } else if (match.result === "black_win") {
        black.wins += 1;
        white.losses += 1;
        if (league) black.tournamentPoints += 1;
    } else if (match.result === "draw") {
        white.draws += 1;
        black.draws += 1;
        if (league) {
            white.tournamentPoints += 0.5;
            black.tournamentPoints += 0.5;
        }
    }

    if (league) {
        white.materialFor += Number(match.whiteMaterial || 0);
        white.materialAgainst += Number(match.blackMaterial || 0);
        black.materialFor += Number(match.blackMaterial || 0);
        black.materialAgainst += Number(match.whiteMaterial || 0);
    }

    white.capturePoints += Math.max(0, 39 - Number(match.blackMaterial || 39));
    black.capturePoints += Math.max(0, 39 - Number(match.whiteMaterial || 39));
    white.totalMoves += Number(match.whiteMoves || 0);
    black.totalMoves += Number(match.blackMoves || 0);

    await Promise.all([white.save(), black.save()]);
    match.resultApplied = true;
    await match.save();
    await refreshRanks();
}

async function finalizeMatch(match, result, reason) {
    if (match.status === "completed") return match;

    commitElapsed(match);

    match.status = "completed";
    match.activeColor = null;
    match.turnStartedAt = null;
    match.result = result;
    match.resultReason = clean(reason) || "Match completed";
    match.completedAt = new Date();

    if (result === "white_win") match.winnerRegistrationId = match.whiteRegistrationId;
    else if (result === "black_win") match.winnerRegistrationId = match.blackRegistrationId;
    else match.winnerRegistrationId = "";

    await match.save();
    await applyResultToPlayers(match);
    return match;
}

async function checkTimeout(match) {
    if (match.status !== "running") return match;

    const times = derivedTimes(match);
    if (times.whiteTimeMs <= 0) {
        match.whiteTimeMs = 0;
        return finalizeMatch(match, "black_win", "White time expired");
    }
    if (times.blackTimeMs <= 0) {
        match.blackTimeMs = 0;
        return finalizeMatch(match, "white_win", "Black time expired");
    }
    return match;
}

async function materialAdjudicationIfNeeded(match) {
    if (match.status !== "running" || fullMoves(match) < 50) return match;

    const diff = Number(match.whiteMaterial || 0) - Number(match.blackMaterial || 0);
    if (Math.abs(diff) <= 2) {
        return finalizeMatch(match, "draw", "50-move BYTEFEST material adjudication: difference 0–2");
    }

    return finalizeMatch(
        match,
        diff > 0 ? "white_win" : "black_win",
        `50-move BYTEFEST material adjudication: ${Math.abs(diff)}-point material advantage`
    );
}

function publicMatch(match, whitePlayer = null, blackPlayer = null) {
    const times = derivedTimes(match);
    return {
        id: String(match._id),
        phase: match.phase,
        boardNumber: match.boardNumber,
        whiteRegistrationId: match.whiteRegistrationId,
        blackRegistrationId: match.blackRegistrationId,
        whiteName: match.whiteName,
        blackName: match.blackName,
        status: match.status,
        activeColor: match.activeColor,
        whiteTimeMs: times.whiteTimeMs,
        blackTimeMs: times.blackTimeMs,
        timeControl: "8+3",
        incrementMs: Number(match.incrementMs || 3000),
        whiteMoves: match.whiteMoves,
        blackMoves: match.blackMoves,
        fullMoves: fullMoves(match),
        whiteMaterial: match.whiteMaterial,
        blackMaterial: match.blackMaterial,
        whiteTournamentPoints: Number(whitePlayer?.tournamentPoints || 0),
        blackTournamentPoints: Number(blackPlayer?.tournamentPoints || 0),
        fen: match.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        lastMoveNotation: match.lastMoveNotation || "",
        result: match.result,
        resultReason: match.resultReason,
        winnerRegistrationId: match.winnerRegistrationId
    };
}

async function pauseMatch(match, pausedByEvent = false) {
    if (match.status !== "running") return match;
    commitElapsed(match);
    match.status = "paused";
    match.pausedByEvent = pausedByEvent;
    match.turnStartedAt = null;
    await match.save();
    return match;
}

async function resumeMatch(match) {
    if (match.status !== "paused") return match;
    match.status = "running";
    match.pausedByEvent = false;
    match.turnStartedAt = new Date();
    await match.save();
    return match;
}

module.exports = {
    PIECE_VALUES,
    CAPTURE_LIMITS,
    clean,
    fullMoves,
    derivedTimes,
    commitElapsed,
    refreshRanks,
    finalizeMatch,
    checkTimeout,
    materialAdjudicationIfNeeded,
    publicMatch,
    pauseMatch,
    resumeMatch
};
