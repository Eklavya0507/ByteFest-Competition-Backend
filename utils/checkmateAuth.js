const crypto = require("crypto");
const CheckmatePlayer = require("../models/CheckmatePlayer");

const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

function secret() {
    const value = String(process.env.CHECKMATE_SECRET || process.env.ADMIN_SECRET || "");
    if (!value) throw new Error("CHECKMATE_SECRET or ADMIN_SECRET is not configured");
    return value;
}

function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function sign(value) {
    return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function hashPassword(value) {
    return crypto.createHmac("sha256", secret()).update(String(value)).digest("hex");
}

function createPlayerToken(player) {
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
        registrationId: player.registrationId,
        event: "Checkmate",
        role: "checkmate-player",
        iat: now,
        exp: now + TOKEN_LIFETIME_SECONDS
    })).toString("base64url");
    return `${payload}.${sign(payload)}`;
}

function verifyPlayerToken(token) {
    try {
        const [payload, signature, extra] = String(token || "").split(".");
        if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) return null;
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (
            data.role !== "checkmate-player" ||
            !data.registrationId ||
            !data.exp ||
            data.exp <= Math.floor(Date.now() / 1000)
        ) return null;
        return data;
    } catch {
        return null;
    }
}

async function requirePlayer(req, res, next) {
    try {
        const auth = String(req.headers.authorization || "");
        if (!auth.startsWith("Bearer ")) return res.status(401).json({ message: "Player login required" });

        const data = verifyPlayerToken(auth.slice(7));
        if (!data) return res.status(401).json({ message: "Invalid or expired Checkmate session" });

        const player = await CheckmatePlayer.findOne({ registrationId: data.registrationId });
        if (!player) return res.status(401).json({ message: "Checkmate player account not found" });

        req.checkmatePlayer = player;
        next();
    } catch (error) {
        console.error("Checkmate auth error:", error);
        res.status(500).json({ message: "Server error" });
    }
}

module.exports = { createPlayerToken, hashPassword, requirePlayer, safeEqual };
