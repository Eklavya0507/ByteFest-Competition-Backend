const crypto = require("crypto");
const CodeSprintTeam = require("../models/CodeSprintTeam");
const { makeCompetitionPassword } = require("./competitionPassword");

const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

function secret() {
    const value = String(process.env.CODESPRINT_SECRET || process.env.ADMIN_SECRET || "");
    if (!value) throw new Error("CODESPRINT_SECRET is not configured");
    return value;
}

function safeEqual(first, second) {
    const a = Buffer.from(String(first));
    const b = Buffer.from(String(second));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sign(value) {
    return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function hashPassword(password) {
    return crypto.createHmac("sha256", secret()).update(String(password)).digest("hex");
}

function makeTeamPassword(teamName, teamId) {
    return makeCompetitionPassword({ registrationId: teamId, teamName, event: "Code Sprint" });
}

function createTeamToken(team) {
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
        teamId: team.teamId,
        event: "Code Sprint",
        role: "codesprint-team",
        iat: now,
        exp: now + TOKEN_LIFETIME_SECONDS
    })).toString("base64url");
    return `${payload}.${sign(payload)}`;
}

function verifyTeamToken(token) {
    try {
        const [payload, signature, extra] = String(token || "").split(".");
        if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) return null;
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (data.role !== "codesprint-team" || !data.teamId || !data.exp || data.exp <= now) return null;
        return data;
    } catch {
        return null;
    }
}

async function requireTeam(req, res, next) {
    try {
        const auth = String(req.headers.authorization || "");
        if (!auth.startsWith("Bearer ")) return res.status(401).json({ message: "Team login required" });
        const tokenData = verifyTeamToken(auth.slice(7));
        if (!tokenData) return res.status(401).json({ message: "Invalid or expired team session" });
        const team = await CodeSprintTeam.findOne({ teamId: tokenData.teamId });
        if (!team) return res.status(401).json({ message: "Team account not found" });
        req.codeSprintTeam = team;
        return next();
    } catch (error) {
        console.error("Code Sprint auth error:", error);
        return res.status(500).json({ message: "Server error" });
    }
}

module.exports = { createTeamToken, hashPassword, makeTeamPassword, requireTeam, safeEqual };
