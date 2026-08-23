const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();
const adminRoutes = require("./routes/admin");
const participantRoutes = require("./routes/participant");
const codeSprintRoutes = require("./routes/codesprint");
const bugHuntModule = require("./routes/bughunt");
const competitionAdminRoutes = require("./routes/competitionAdmin");

const app=express(); const PORT=Number(process.env.PORT)||5000;
const configuredOrigins=String(process.env.FRONTEND_ORIGINS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
app.disable("x-powered-by");
app.use(cors({origin(origin,cb){if(!origin||configuredOrigins.length===0||configuredOrigins.includes(String(origin).toLowerCase()))return cb(null,true);return cb(new Error("Origin is not allowed by CORS"));},methods:["GET","POST","PATCH","DELETE","OPTIONS"],allowedHeaders:["Content-Type","Authorization"]}));
app.use(express.json({limit:"1mb"}));
app.get("/",(req,res)=>res.json({message:"BYTEFEST Competition Backend is running",status:"OK",version:"2.0.0",events:["Code Sprint","Bug Hunt"]}));
app.use("/api/admin",adminRoutes);
app.use("/api/participant",participantRoutes);
app.use("/api/codesprint",codeSprintRoutes);
app.use("/api/bughunt",bugHuntModule.router);
app.use("/api/competition/admin",competitionAdminRoutes);
app.use((req,res)=>res.status(404).json({message:"API route not found"}));
app.use((error,req,res,next)=>{console.error("Unhandled request error:",error);if(error?.message==="Origin is not allowed by CORS")return res.status(403).json({message:error.message});res.status(500).json({message:"Server error"});});
async function startServer(){if(!process.env.MONGODB_URI)throw new Error("MONGODB_URI is not configured");if(!process.env.REGISTRATION_MONGODB_URI)throw new Error("REGISTRATION_MONGODB_URI is not configured");await mongoose.connect(process.env.MONGODB_URI);console.log("Competition MongoDB connected successfully");app.listen(PORT,()=>console.log(`BYTEFEST Competition backend running on port ${PORT}`));}
if(require.main===module){startServer().catch(error=>{console.error("Server startup failed:",error.message);process.exitCode=1;});}
module.exports={app,startServer};
