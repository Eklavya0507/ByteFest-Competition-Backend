const express=require("express");
const BugHuntTeam=require("../models/BugHuntTeam");
const BugHuntControl=require("../models/BugHuntControl");
const questions=require("../config/bughuntQuestions");
const {requireTeam}=require("../utils/bugHuntAuth");
const {safeEqual}=require("../utils/competitionPassword");

const router=express.Router(),MAX_VIOLATIONS=4,ORDER=["round1","round2","round3","surprise"];
const STARTS={
 round1:0,
 round2:questions.round1.durationSeconds,
 round3:questions.round1.durationSeconds+questions.round2.durationSeconds,
 surprise:questions.round1.durationSeconds+questions.round2.durationSeconds+questions.round3.durationSeconds,
 final:questions.round1.durationSeconds+questions.round2.durationSeconds+questions.round3.durationSeconds+questions.surprise.durationSeconds
};
const FINAL_END=STARTS.final+questions.final.durationSeconds;
const clean=v=>String(v??"").trim(),normalize=v=>clean(v).replace(/\s+/g," ").toLowerCase();

function ensureRound(team,key){team.progress=team.progress||{};team.progress[key]=team.progress[key]||{score:0,hintsUsed:0,wrongSubmissions:0,startedAt:null,completedAt:null,stages:{}};return team.progress[key]}
function ensureStage(team,key,index){const round=ensureRound(team,key),sk=`stage${index}`;round.stages[sk]=round.stages[sk]||{startedAt:null,completedAt:null,score:0,attempts:0,hintsUsed:[],lastAnswer:"",completionMs:null};return round.stages[sk]}
const roundScore=(team,key)=>Number(team.progress?.[key]?.score||0);
const qualificationScore=team=>ORDER.reduce((sum,key)=>sum+roundScore(team,key),0);
function phaseFrom(control,now=Date.now()){
 if(!control?.startedAt)return{key:"waiting_start",endsAt:null};
 const start=new Date(control.startedAt).getTime(),elapsed=Math.max(0,Math.floor((now-start)/1000));
 if(elapsed<STARTS.round2)return{key:"round1",endsAt:new Date(start+STARTS.round2*1000)};
 if(elapsed<STARTS.round3)return{key:"round2",endsAt:new Date(start+STARTS.round3*1000)};
 if(elapsed<STARTS.surprise)return{key:"round3",endsAt:new Date(start+STARTS.surprise*1000)};
 if(elapsed<STARTS.final)return{key:"surprise",endsAt:new Date(start+STARTS.final*1000)};
 if(elapsed<FINAL_END)return{key:"final",endsAt:new Date(start+FINAL_END*1000)};
 return{key:"completed",endsAt:new Date(start+FINAL_END*1000)};
}
async function getControl(){return BugHuntControl.findOneAndUpdate({key:"bughunt"},{$setOnInsert:{key:"bughunt"}},{upsert:true,new:true})}
function totalCompletion(team,key){const stages=Object.values(team.progress?.[key]?.stages||{});return stages.reduce((sum,s)=>sum+(Number.isFinite(s?.completionMs)?s.completionMs:0),0)||Number.MAX_SAFE_INTEGER}
async function finalizeQualification(){
 const teams=await BugHuntTeam.find({"security.disqualified":{$ne:true}});if(!teams.length)return;
 for(const t of teams){t.qualificationScore=qualificationScore(t);await t.save()}
 teams.sort((a,b)=>b.qualificationScore-a.qualificationScore||a.totalHintsUsed-b.totalHintsUsed||roundScore(b,"surprise")-roundScore(a,"surprise")||roundScore(b,"round3")-roundScore(a,"round3")||a.wrongSubmissions-b.wrongSubmissions||totalCompletion(a,"surprise")-totalCompletion(b,"surprise"));
 for(let i=0;i<teams.length;i++){teams[i].rank=i+1;teams[i].currentRound=i<3?"final":"eliminated";teams[i].currentStage=1;await teams[i].save()}
}
async function finalizeFinal(){
 const finalists=await BugHuntTeam.find({rank:{$gte:1,$lte:3},"security.disqualified":{$ne:true}});if(!finalists.length)return;
 finalists.sort((a,b)=>roundScore(b,"final")-roundScore(a,"final")||Number(a.progress?.final?.hintsUsed||0)-Number(b.progress?.final?.hintsUsed||0)||Number(a.progress?.final?.wrongSubmissions||0)-Number(b.progress?.final?.wrongSubmissions||0)||totalCompletion(a,"final")-totalCompletion(b,"final")||b.qualificationScore-a.qualificationScore);
 for(let i=0;i<finalists.length;i++){finalists[i].finalPlace=i+1;finalists[i].finalScore=roundScore(finalists[i],"final");finalists[i].currentRound="completed";await finalists[i].save()}
 await BugHuntControl.updateOne({key:"bughunt"},{$set:{finalizedAt:new Date()}});
}
async function syncTeam(team){
 const control=await getControl(),phase=phaseFrom(control);
 if(phase.key==="waiting_start"){if(!["eliminated","completed"].includes(team.currentRound))team.currentRound="waiting_start";return{control,phase}}
 if(ORDER.includes(phase.key)){
  if(!team.security?.disqualified&&!["eliminated","completed"].includes(team.currentRound)&&team.currentRound!==phase.key){team.currentRound=phase.key;team.currentStage=1;ensureStage(team,phase.key,1);team.markModified("progress");await team.save()}
 }else if(phase.key==="final"){
  if(!team.rank)await finalizeQualification();const fresh=await BugHuntTeam.findById(team._id);if(fresh){team.rank=fresh.rank;team.currentRound=fresh.currentRound;team.currentStage=fresh.currentStage;team.qualificationScore=fresh.qualificationScore;team.finalPlace=fresh.finalPlace}
 }else if(phase.key==="completed"){
  if(!team.rank)await finalizeQualification();await finalizeFinal();const fresh=await BugHuntTeam.findById(team._id);if(fresh){team.rank=fresh.rank;team.currentRound=fresh.currentRound;team.currentStage=fresh.currentStage;team.qualificationScore=fresh.qualificationScore;team.finalPlace=fresh.finalPlace}
 }
 return{control,phase};
}
function stagePublic(q,p){return{id:q.id,title:q.title,type:q.type||"short-answer",maxPoints:q.maxPoints,prompt:q.prompt,placeholder:q.placeholder||"Enter answer",ui:q.ui||null,hints:(q.hints||[]).map((h,i)=>({number:i+1,penalty:h.penalty,used:p.hintsUsed.includes(i+1),text:p.hintsUsed.includes(i+1)?h.text:null,available:i===0||p.hintsUsed.includes(i)}))}}

router.get("/state",requireTeam,async(req,res)=>{try{const team=req.bugHuntTeam,{control,phase}=await syncTeam(team),cfg=questions[team.currentRound];res.json({teamId:team.teamId,registrationId:team.registrationId,teamName:team.teamName,members:team.members,currentRound:team.currentRound,currentStage:team.currentStage,roundTitle:cfg?.title||"",stageCount:cfg?.stages?.length||0,qualificationScore:qualificationScore(team),currentRoundScore:roundScore(team,team.currentRound),finalScore:roundScore(team,"final"),rank:team.rank,finalPlace:team.finalPlace,security:{violations:team.security?.violations||0,maxViolations:MAX_VIOLATIONS,locked:Boolean(team.security?.locked),lockReason:team.security?.lockReason||"",disqualified:Boolean(team.security?.disqualified)},eventStartedAt:control.startedAt,phaseEndsAt:phase.endsAt})}catch(e){console.error(e);res.status(500).json({message:"Server error"})}});
router.get("/question",requireTeam,async(req,res)=>{try{const team=req.bugHuntTeam,{phase}=await syncTeam(team);if(team.security?.disqualified)return res.status(403).json({message:"Team is disqualified"});if(team.security?.locked)return res.status(423).json({message:"Competition is locked",locked:true});if(!questions[team.currentRound])return res.status(409).json({message:team.currentRound==="waiting_start"?"Bug Hunt has not started yet":"No active challenge"});if(team.currentRound!==phase.key&&!(phase.key==="final"&&team.currentRound==="final"))return res.status(409).json({message:"Wait for the official round"});const cfg=questions[team.currentRound],q=cfg.stages[team.currentStage-1];if(!q)return res.status(409).json({message:"Round completed. Wait for the official timer."});const p=ensureStage(team,team.currentRound,team.currentStage);if(!p.startedAt)p.startedAt=new Date();if(!team.progress[team.currentRound].startedAt)team.progress[team.currentRound].startedAt=new Date();team.markModified("progress");await team.save();res.json({round:team.currentRound,roundTitle:cfg.title,stage:team.currentStage,stageCount:cfg.stages.length,phaseEndsAt:phase.endsAt,question:stagePublic(q,p)})}catch(e){console.error(e);res.status(500).json({message:"Server error"})}});
router.post("/hint/:number",requireTeam,async(req,res)=>{try{const team=req.bugHuntTeam;await syncTeam(team);if(team.security?.locked)return res.status(423).json({message:"Competition is locked"});const cfg=questions[team.currentRound],q=cfg?.stages?.[team.currentStage-1];if(!q)return res.status(409).json({message:"No active challenge"});const n=Number(req.params.number),h=q.hints?.[n-1];if(!h)return res.status(404).json({message:"Hint not found"});const p=ensureStage(team,team.currentRound,team.currentStage);if(n>1&&!p.hintsUsed.includes(n-1))return res.status(409).json({message:`Use Hint ${n-1} first`});const used=p.hintsUsed.includes(n);if(!used){p.hintsUsed.push(n);team.progress[team.currentRound].hintsUsed+=1;team.totalHintsUsed+=1;team.markModified("progress");await team.save()}res.json({number:n,text:h.text,penalty:h.penalty,chargedNow:!used})}catch(e){console.error(e);res.status(500).json({message:"Server error"})}});
router.post("/submit",requireTeam,async(req,res)=>{try{const team=req.bugHuntTeam,{phase}=await syncTeam(team);if(team.security?.locked)return res.status(423).json({message:"Competition is locked"});if(team.currentRound!==phase.key&&!(phase.key==="final"&&team.currentRound==="final"))return res.status(409).json({message:"Official round has changed"});const cfg=questions[team.currentRound],q=cfg?.stages?.[team.currentStage-1];if(!q)return res.status(409).json({message:"No active challenge"});const answer=clean(req.body?.answer);if(!answer)return res.status(400).json({message:"Enter an answer"});const p=ensureStage(team,team.currentRound,team.currentStage);if(p.completedAt)return res.status(409).json({message:"Stage already completed"});p.attempts+=1;p.lastAnswer=answer;const accepted=typeof q.validate==="function"?Boolean(q.validate(answer)):(q.answers||[]).some(a=>normalize(a)===normalize(answer));if(!accepted){team.wrongSubmissions+=1;ensureRound(team,team.currentRound).wrongSubmissions+=1;team.markModified("progress");await team.save();return res.json({correct:false,attempts:p.attempts,message:"Answer not accepted. Try again."})}const hintPenalty=p.hintsUsed.reduce((s,n)=>s+Number(q.hints?.[n-1]?.penalty||0),0),wrongPenalty=Math.max(0,p.attempts-2)*5,earned=Math.max(0,Number(q.maxPoints||0)-hintPenalty-wrongPenalty),done=new Date();p.completedAt=done;p.score=earned;p.completionMs=p.startedAt?done-new Date(p.startedAt):null;team.progress[team.currentRound].score+=earned;const stageCount=cfg.stages.length,completedRound=team.currentStage>=stageCount;if(!completedRound){team.currentStage+=1;ensureStage(team,team.currentRound,team.currentStage)}else team.progress[team.currentRound].completedAt=done;team.markModified("progress");await team.save();res.json({correct:true,earned,completedRound,nextStage:team.currentStage,message:completedRound?`Correct. +${earned} points. Round completed; wait for the official timer.`:`Correct. +${earned} points. Stage ${team.currentStage} is ready.`})}catch(e){console.error(e);res.status(500).json({message:"Server error"})}});
router.post("/security/violation",requireTeam,async(req,res)=>{try{const t=req.bugHuntTeam;if(t.security?.disqualified)return res.status(403).json({message:"Team is disqualified"});if(t.security?.locked)return res.json({locked:true,violations:t.security.violations,maxViolations:MAX_VIOLATIONS});t.security.violations=Math.min(MAX_VIOLATIONS,(t.security.violations||0)+1);t.security.locked=true;t.security.lockReason=clean(req.body?.reason)||"Competition window lost focus";t.security.events.push({reason:t.security.lockReason,detail:clean(req.body?.detail),at:new Date()});await t.save();res.json({locked:true,violations:t.security.violations,maxViolations:MAX_VIOLATIONS,coordinatorDecisionRequired:t.security.violations>=MAX_VIOLATIONS})}catch(e){console.error(e);res.status(500).json({message:"Server error"})}});
router.post("/security/unlock",requireTeam,async(req,res)=>{try{const t=req.bugHuntTeam,required=String(process.env.BUGHUNT_COORDINATOR_PASSWORD||"");if(!required)return res.status(503).json({message:"Coordinator password is not configured"});if(!safeEqual(clean(req.body?.password),required))return res.status(403).json({message:"Incorrect coordinator password"});const action=clean(req.body?.action||"resume").toLowerCase();if(action==="disqualify"&&t.security.violations>=MAX_VIOLATIONS){t.security.disqualified=true;t.security.locked=true;t.currentRound="eliminated";await t.save();return res.json({disqualified:true,message:"Team disqualified by coordinator"})}t.security.locked=false;t.security.lockReason="";const last=t.security.events[t.security.events.length-1];if(last){last.unlockedAt=new Date();last.unlockedBy="coordinator"}await t.save();res.json({unlocked:true,violations:t.security.violations,maxViolations:MAX_VIOLATIONS})}catch(e){console.error(e);res.status(500).json({message:"Server error"})}});

module.exports={router,getControl,phaseFrom,finalizeQualification,finalizeFinal};
