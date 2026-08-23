const express = require("express");
const CodeSprintTeam = require("../models/CodeSprintTeam");
const BugHuntTeam = require("../models/BugHuntTeam");
const { findRegistration } = require("../utils/registrationDb");
const { clean, safeEqual, makeCompetitionPassword } = require("../utils/competitionPassword");
const codeAuth = require("../utils/codeSprintAuth");
const bugAuth = require("../utils/bugHuntAuth");

const router = express.Router();
const ACTIVE_EVENTS = new Set(["Code Sprint", "Bug Hunt"]);

function memberNames(registration) {
    return [registration?.participant?.name, ...(registration?.members || []).map(m => m?.name)]
        .map(clean).filter(Boolean);
}

router.post("/login", async (req, res) => {
    try {
        const event = clean(req.body?.event);
        const registrationId = clean(req.body?.registrationId).toUpperCase();
        const password = clean(req.body?.password);
        if (!ACTIVE_EVENTS.has(event)) return res.status(400).json({ message: "Select an active competition event" });
        if (!/^BF26-[A-Z0-9]{8}$/.test(registrationId)) return res.status(400).json({ message: "Enter a valid BYTEFEST Registration ID" });
        if (!password) return res.status(400).json({ message: "Password is required" });

        const registration = await findRegistration(registrationId);
        if (!registration) return res.status(404).json({ message: "Registration ID not found" });
        if (registration.event !== event) return res.status(403).json({ message: `This Registration ID is registered for ${registration.event}` });
        if (registration.payment?.status !== "PAID") return res.status(403).json({ message: "Registration payment is not approved yet" });
        if (!clean(registration.teamName)) return res.status(409).json({ message: "Team Name is not set for this registration. Contact the coordinator." });

        const expectedPassword = makeCompetitionPassword(registration);
        if (!safeEqual(password, expectedPassword)) return res.status(401).json({ message: "Incorrect Registration ID or password" });

        const members = memberNames(registration);
        if (event === "Code Sprint") {
            let team = await CodeSprintTeam.findOne({ registrationId });
            if (!team) {
                team = await CodeSprintTeam.create({
                    registrationId,
                    teamId: registrationId,
                    teamName: registration.teamName,
                    passwordHash: codeAuth.hashPassword(expectedPassword),
                    members
                });
            } else {
                team.teamName = registration.teamName;
                team.members = members;
                team.passwordHash = codeAuth.hashPassword(expectedPassword);
                await team.save();
            }
            if (team.security?.disqualified) return res.status(403).json({ message: "This team is disqualified" });
            return res.json({ event, token: codeAuth.createTeamToken(team), registrationId, teamName: team.teamName });
        }

        let team = await BugHuntTeam.findOne({ registrationId });
        if (!team) {
            team = await BugHuntTeam.create({
                registrationId,
                teamId: registrationId,
                teamName: registration.teamName,
                passwordHash: bugAuth.hashPassword(expectedPassword),
                members
            });
        } else {
            team.teamName = registration.teamName;
            team.members = members;
            team.passwordHash = bugAuth.hashPassword(expectedPassword);
            await team.save();
        }
        if (team.security?.disqualified) return res.status(403).json({ message: "This team is disqualified" });
        return res.json({ event, token: bugAuth.createTeamToken(team), registrationId, teamName: team.teamName });
    } catch (error) {
        console.error("Participant login error:", error);
        return res.status(500).json({ message: error.message === "REGISTRATION_MONGODB_URI is not configured" ? error.message : "Server error" });
    }
});

module.exports = router;
