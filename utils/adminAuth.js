const crypto = require("crypto");

const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

function secret() {
    const value = String(process.env.ADMIN_SECRET || "");
    if (!value) throw new Error("ADMIN_SECRET is not configured");
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

function createAdminToken() {
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
        role: "competition-admin",
        iat: now,
        exp: now + TOKEN_LIFETIME_SECONDS
    })).toString("base64url");
    return `${payload}.${sign(payload)}`;
}

function verifyAdminToken(token) {
    try {
        const [payload, signature, extra] = String(token || "").split(".");
        if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) return null;
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (data.role !== "competition-admin" || !data.exp || data.exp <= now) return null;
        return data;
    } catch {
        return null;
    }
}

function requireAdmin(req, res, next) {
    const auth = String(req.headers.authorization || "");
    if (!auth.startsWith("Bearer ")) return res.status(401).json({ message: "Admin login required" });
    const data = verifyAdminToken(auth.slice(7));
    if (!data) return res.status(401).json({ message: "Invalid or expired admin session" });
    req.competitionAdmin = data;
    return next();
}

module.exports = { createAdminToken, requireAdmin, safeEqual };
