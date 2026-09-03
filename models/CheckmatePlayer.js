const mongoose = require("mongoose");

const schema = new mongoose.Schema({
    registrationId: { type: String, required: true, unique: true, uppercase: true, index: true },
    playerName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },

    tournamentPoints: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },

    capturePoints: { type: Number, default: 0 },
    materialFor: { type: Number, default: 0 },
    materialAgainst: { type: Number, default: 0 },
    totalMoves: { type: Number, default: 0 },

    rank: { type: Number, default: null },
    rankSource: { type: String, enum: ["auto", "manual"], default: "auto" },
    finalPlace: { type: Number, default: null },
    finalPlaceSource: { type: String, enum: ["auto", "manual"], default: "auto" }
}, { timestamps: true });

module.exports = mongoose.model("CheckmatePlayer", schema);
