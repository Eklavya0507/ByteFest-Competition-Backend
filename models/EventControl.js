const mongoose = require("mongoose");

const schema = new mongoose.Schema({
    event: {
        type: String,
        required: true,
        unique: true,
        enum: ["Bug Hunt", "Checkmate"]
    },
    status: {
        type: String,
        enum: ["not_started", "running", "paused"],
        default: "not_started"
    },
    startedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    totalPausedMs: { type: Number, default: 0 },
    startedBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" }
}, { timestamps: true });

module.exports = mongoose.model("EventControl", schema);
