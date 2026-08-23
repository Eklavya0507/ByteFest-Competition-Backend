const express = require("express");
const { requireAdmin } = require("../utils/adminAuth");
const { listApprovedRegistrations } = require("../utils/registrationDb");
const { makeCompetitionPassword, clean } = require("../utils/competitionPassword");
const CodeSprintTeam = require("../models/CodeSprintTeam");
const BugHuntTeam = require("../models/BugHuntTeam");
const BugHuntControl = require("../models/BugHuntControl");
const bugRoutes = require("./bughunt");

const router = express.Router();
function names(r){return [r?.participant?.name,...(r?.members||[]).map(m=>m?.name)].map(clean).filter(Boolean);}
function score(team,key){return Number(team?.progress?.[key]?.score||0);}

router.get("/registrations", requireAdmin, async (req,res)=>{
 try{
  const event=clean(req.query.event); if(!["Code Sprint","Bug Hunt"].includes(event))return res.status(400).json({message:"Select Code Sprint or Bug Hunt"});
  const registrations=await listApprovedRegistrations(event);
  const Model=event==="Code Sprint"?CodeSprintTeam:BugHuntTeam;
  const states=await Model.find({registrationId:{$in:registrations.map(r=>r.registrationId)}}).lean();
  const map=new Map(states.map(s=>[s.registrationId,s]));
  const rows=registrations.map(r=>{const s=map.get(r.registrationId);return {registrationId:r.registrationId,teamName:r.teamName||"",members:names(r),password:r.teamName?makeCompetitionPassword(r):"TEAM NAME NOT SET",loggedIn:Boolean(s),currentRound:s?.currentRound||"not_started",currentStage:s?.currentStage||1,totalScore:event==="Code Sprint"?Number(s?.totalScore||0):Number(s?.qualificationScore||0),round1:score(s,"round1"),round2:score(s,"round2"),round3:event==="Bug Hunt"?score(s,"round3"):undefined,surprise:event==="Bug Hunt"?score(s,"surprise"):undefined,finalScore:event==="Bug Hunt"?score(s,"final"):undefined,hints:Number(s?.totalHintsUsed||0),rank:s?.rank||null,finalPlace:s?.finalPlace||s?.knockout?.finalPlace||null,violations:Number(s?.security?.violations||0),locked:Boolean(s?.security?.locked),disqualified:Boolean(s?.security?.disqualified)};});
  res.json(rows);
 }catch(e){console.error(e);res.status(500).json({message:e.message==="REGISTRATION_MONGODB_URI is not configured"?e.message:"Server error"});}
});

router.patch("/team/:event/:registrationId/security", requireAdmin, async(req,res)=>{
 try{
  const event=decodeURIComponent(req.params.event),id=clean(req.params.registrationId).toUpperCase(),action=clean(req.body?.action).toLowerCase();
  const Model=event==="Code Sprint"?CodeSprintTeam:event==="Bug Hunt"?BugHuntTeam:null;if(!Model)return res.status(400).json({message:"Unsupported event"});
  const team=await Model.findOne({registrationId:id});if(!team)return res.status(404).json({message:"Team has not entered the competition yet"});
  if(action==="unlock"){team.security.locked=false;team.security.lockReason="";}
  else if(action==="disqualify"){team.security.disqualified=true;team.security.locked=true;team.currentRound="eliminated";}
  else if(action==="resume"){team.security.disqualified=false;team.security.locked=false;team.security.lockReason="";}
  else return res.status(400).json({message:"Use unlock, disqualify or resume"});
  await team.save();res.json({message:`${action} applied`,registrationId:id});
 }catch(e){console.error(e);res.status(500).json({message:"Server error"});}
});

router.get("/bughunt/control", requireAdmin, async(req,res)=>{
 try{const c=await bugRoutes.getControl();const p=bugRoutes.phaseFrom(c);res.json({startedAt:c.startedAt,phase:p.key,phaseEndsAt:p.endsAt,finalizedAt:c.finalizedAt});}catch(e){res.status(500).json({message:"Server error"});}
});
router.post("/bughunt/start", requireAdmin, async(req,res)=>{
 try{let c=await BugHuntControl.findOne({key:"bughunt"});if(c?.startedAt)return res.status(409).json({message:"Bug Hunt has already started",startedAt:c.startedAt});c=await BugHuntControl.findOneAndUpdate({key:"bughunt"},{$set:{startedAt:new Date(),startedBy:req.admin?.email||"admin",finalizedAt:null}},{upsert:true,new:true});res.json({message:"Bug Hunt started. Automatic round timing is active.",startedAt:c.startedAt});}catch(e){console.error(e);res.status(500).json({message:"Server error"});}
});

router.get("/rankings", requireAdmin, async(req,res)=>{
 try{const event=clean(req.query.event);const Model=event==="Bug Hunt"?BugHuntTeam:CodeSprintTeam;const rows=await Model.find({}).sort({finalPlace:1,rank:1,totalScore:-1,qualificationScore:-1}).lean();res.json(rows.map(t=>({registrationId:t.registrationId||t.teamId,teamName:t.teamName,rank:t.rank||null,score:event==="Bug Hunt"?Number(t.qualificationScore||0):Number(t.totalScore||0),finalPlace:t.finalPlace||t.knockout?.finalPlace||null,status:t.currentRound})));}catch(e){res.status(500).json({message:"Server error"});}
});
module.exports=router;
