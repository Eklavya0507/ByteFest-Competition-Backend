const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    key: { type: String, unique: true, default: "bughunt" },
    startedAt: { type: Date, default: null },
    startedBy: { type: String, default: "" },
    finalizedAt: { type: Date, default: null }
}, { timestamps: true });
module.exports = mongoose.model("BugHuntControl", schema);
