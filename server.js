const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const adminRoutes = require("./routes/admin");
const participantRoutes = require("./routes/participant");
const codeSprintRoutes = require("./routes/codesprint");
const bugHuntModule = require("./routes/bughunt");
const checkmateRoutes = require("./routes/checkmate");
const competitionAdminRoutes = require("./routes/competitionAdmin");
const EventControl = require("./models/EventControl");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const configuredOrigins = String(process.env.FRONTEND_ORIGINS || "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

app.disable("x-powered-by");

app.use(cors({
    origin(origin, callback) {
        if (
            !origin ||
            configuredOrigins.length === 0 ||
            configuredOrigins.includes(String(origin).toLowerCase())
        ) {
            return callback(null, true);
        }
        return callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "1mb" }));

async function getEventControl(event) {
    return EventControl.findOneAndUpdate(
        { event },
        { $setOnInsert: { event } },
        { upsert: true, new: true }
    );
}

app.get("/", (req, res) => res.json({
    message: "BYTEFEST Competition Backend is running",
    status: "OK",
    version: "3.0.0",
    events: ["Code Sprint", "Bug Hunt", "Checkmate"]
}));

/* Public read-only control state for participant screens. */
app.get("/api/event-control/:event", async (req, res) => {
    try {
        const event = decodeURIComponent(String(req.params.event || ""));
        if (!["Code Sprint", "Bug Hunt", "Checkmate"].includes(event)) {
            return res.status(400).json({ message: "Unsupported event" });
        }
        const control = await getEventControl(event);
        res.json({
            event,
            status: control.status,
            startedAt: control.startedAt,
            pausedAt: control.pausedAt
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

/*
  Code Sprint and Bug Hunt challenge actions are blocked while the admin event
  control is NOT STARTED or STOPPED. State/security endpoints remain available.
*/
function eventGate(event) {
    return async (req, res, next) => {
        try {
            const controlledAction =
                req.path === "/question" ||
                req.path === "/submit" ||
                req.path.startsWith("/hint/");

            if (!controlledAction) return next();

            const control = await getEventControl(event);
            if (control.status === "not_started") {
                return res.status(409).json({ message: `${event} has not started yet` });
            }
            if (control.status === "paused") {
                return res.status(423).json({ message: `${event} is stopped by the admin` });
            }
            next();
        } catch (error) {
            console.error(`${event} event gate error:`, error);
            res.status(500).json({ message: "Server error" });
        }
    };
}

app.use("/api/admin", adminRoutes);
app.use("/api/participant", participantRoutes);
app.use("/api/codesprint", eventGate("Code Sprint"), codeSprintRoutes);
app.use("/api/bughunt", eventGate("Bug Hunt"), bugHuntModule.router);
app.use("/api/checkmate", checkmateRoutes);
app.use("/api/competition/admin", competitionAdminRoutes);

app.use((req, res) => res.status(404).json({ message: "API route not found" }));

app.use((error, req, res, next) => {
    console.error("Unhandled request error:", error);
    if (error?.message === "Origin is not allowed by CORS") {
        return res.status(403).json({ message: error.message });
    }
    res.status(500).json({ message: "Server error" });
});

async function startServer() {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
    if (!process.env.REGISTRATION_MONGODB_URI) throw new Error("REGISTRATION_MONGODB_URI is not configured");

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Competition MongoDB connected successfully");

    app.listen(PORT, () => console.log(`BYTEFEST Competition backend running on port ${PORT}`));
}

if (require.main === module) {
    startServer().catch(error => {
        console.error("Server startup failed:", error.message);
        process.exitCode = 1;
    });
}

module.exports = { app, startServer };
