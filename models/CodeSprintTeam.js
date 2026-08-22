const mongoose = require("mongoose");

const securityEventSchema = new mongoose.Schema(
    {
        reason: { type: String, default: "" },
        detail: { type: String, default: "" },
        at: { type: Date, default: Date.now },
        unlockedAt: { type: Date, default: null },
        unlockedBy: { type: String, default: "" }
    },
    { _id: false }
);

const codeSprintTeamSchema = new mongoose.Schema(
    {
        registrationId: { type: String, unique: true, sparse: true, uppercase: true, index: true, default: undefined },
        teamId: { type: String, unique: true, required: true, uppercase: true, index: true },
        teamName: { type: String, required: true, trim: true },
        passwordHash: { type: String, required: true },
        members: { type: [String], default: [] },

        currentRound: {
            type: String,
            enum: [
                "round1", "round2", "qualifier", "awaiting_ranking",
                "semifinal", "semifinal_loser_wait", "wildcard", "entry_final_wait",
                "entry_final", "wildcard_final_wait", "wildcard_final", "final_wait",
                "final", "eliminated", "completed"
            ],
            default: "round1"
        },
        currentStage: { type: Number, default: 1, min: 1 },
        progress: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
        totalScore: { type: Number, default: 0 },
        totalHintsUsed: { type: Number, default: 0 },
        correctStages: { type: Number, default: 0 },
        rank: { type: Number, default: null },

        security: {
            violations: { type: Number, default: 0 },
            locked: { type: Boolean, default: false },
            lockReason: { type: String, default: "" },
            disqualified: { type: Boolean, default: false },
            events: { type: [securityEventSchema], default: [] }
        },

        knockout: {
            semifinalWinner: { type: Boolean, default: null },
            bestSemifinalLoser: { type: Boolean, default: false },
            wildcardEntryWinner: { type: Boolean, default: null },
            entryFinalWinner: { type: Boolean, default: null },
            wildcardFinalWinner: { type: Boolean, default: null },
            finalPlace: { type: Number, default: null }
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("CodeSprintTeam", codeSprintTeamSchema);
