const mongoose = require("mongoose");

const captureSchema = new mongoose.Schema({
    pawn: { type: Number, default: 0 },
    knight: { type: Number, default: 0 },
    bishop: { type: Number, default: 0 },
    rook: { type: Number, default: 0 },
    queen: { type: Number, default: 0 }
}, { _id: false });


const securityEventSchema = new mongoose.Schema({
    reason: { type: String, default: "" },
    detail: { type: String, default: "" },
    at: { type: Date, default: Date.now },
    unlockedAt: { type: Date, default: null },
    unlockedBy: { type: String, default: "" }
}, { _id: false });

const moveSchema = new mongoose.Schema({
    color: { type: String, enum: ["white", "black"], required: true },
    capturedPiece: { type: String, default: "" },
    capturedValue: { type: Number, default: 0 },
    notation: { type: String, default: "" },
    from: { type: String, default: "" },
    to: { type: String, default: "" },
    fen: { type: String, default: "" },
    whiteMaterial: Number,
    blackMaterial: Number,
    at: { type: Date, default: Date.now }
}, { _id: false });

const schema = new mongoose.Schema({
    phase: {
        type: String,
        enum: ["round1", "round2", "round3", "semifinal", "final"],
        required: true
    },
    boardNumber: { type: Number, min: 1, default: 1 },

    whiteRegistrationId: { type: String, required: true, uppercase: true, index: true },
    blackRegistrationId: { type: String, required: true, uppercase: true, index: true },
    whiteName: { type: String, required: true },
    blackName: { type: String, required: true },

    status: {
        type: String,
        enum: ["waiting", "running", "paused", "completed"],
        default: "waiting"
    },
    activeColor: { type: String, enum: ["white", "black", null], default: null },

    clockLimitMs: { type: Number, default: 8 * 60 * 1000 },
    incrementMs: { type: Number, default: 3 * 1000 },
    whiteTimeMs: { type: Number, default: 8 * 60 * 1000 },
    blackTimeMs: { type: Number, default: 8 * 60 * 1000 },
    turnStartedAt: { type: Date, default: null },

    whiteMoves: { type: Number, default: 0 },
    blackMoves: { type: Number, default: 0 },

    whiteMaterial: { type: Number, default: 39 },
    blackMaterial: { type: Number, default: 39 },
    whiteCaptured: { type: captureSchema, default: () => ({}) },
    blackCaptured: { type: captureSchema, default: () => ({}) },

    moves: { type: [moveSchema], default: [] },
    fen: { type: String, default: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
    lastMoveNotation: { type: String, default: "" },

    pausedByEvent: { type: Boolean, default: false },
    pausedBySecurity: { type: Boolean, default: false },

    security: {
        violations: { type: Number, default: 0 },
        locked: { type: Boolean, default: false },
        lockReason: { type: String, default: "" },
        events: { type: [securityEventSchema], default: [] }
    },

    result: {
        type: String,
        enum: ["", "white_win", "black_win", "draw"],
        default: ""
    },
    resultReason: { type: String, default: "" },
    winnerRegistrationId: { type: String, default: "" },
    resultApplied: { type: Boolean, default: false },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
}, { timestamps: true });

schema.index({ phase: 1, boardNumber: 1 });
schema.index({ whiteRegistrationId: 1, status: 1, createdAt: -1 });
schema.index({ blackRegistrationId: 1, status: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("CheckmateMatch", schema);
