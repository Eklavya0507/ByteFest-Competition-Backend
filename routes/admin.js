const express = require("express");
const { createAdminToken, requireAdmin, safeEqual } = require("../utils/adminAuth");

const router = express.Router();

router.post("/login", (req, res) => {
    const supplied = String(req.body?.password || "");
    const required = String(process.env.ADMIN_LOGIN_PASSWORD || "");
    if (!required) return res.status(503).json({ message: "ADMIN_LOGIN_PASSWORD is not configured" });
    if (!safeEqual(supplied, required)) return res.status(403).json({ message: "Incorrect admin password" });
    return res.json({ token: createAdminToken() });
});

router.get("/session", requireAdmin, (req, res) => {
    return res.json({ ok: true });
});

module.exports = router;
