const mongoose = require("mongoose");

let registrationConnection = null;
let RegistrationMirror = null;

const memberSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String
}, { _id: false, strict: false });

const registrationSchema = new mongoose.Schema({
    registrationId: String,
    event: String,
    teamName: String,
    participant: {
        name: String,
        email: String,
        phone: String,
        department: String,
        year: String
    },
    members: [memberSchema],
    payment: {
        status: String,
        amount: Number,
        approvedAt: Date
    },
    createdAt: Date
}, { strict: false, collection: "registrations" });

async function getRegistrationModel() {
    const uri = String(process.env.REGISTRATION_MONGODB_URI || "").trim();
    if (!uri) throw new Error("REGISTRATION_MONGODB_URI is not configured");

    if (!registrationConnection) {
        registrationConnection = mongoose.createConnection(uri, {
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 5
        });
        await registrationConnection.asPromise();
        console.log("Registration MongoDB connected successfully");
    }

    if (!RegistrationMirror) {
        RegistrationMirror = registrationConnection.model("RegistrationMirror", registrationSchema, "registrations");
    }
    return RegistrationMirror;
}

async function findRegistration(registrationId) {
    const Registration = await getRegistrationModel();
    return Registration.findOne({ registrationId: String(registrationId || "").trim().toUpperCase() }).lean();
}

async function listApprovedRegistrations(event) {
    const Registration = await getRegistrationModel();
    return Registration.find({ event, "payment.status": "PAID" })
        .sort({ createdAt: 1, registrationId: 1 })
        .lean();
}

module.exports = { getRegistrationModel, findRegistration, listApprovedRegistrations };
