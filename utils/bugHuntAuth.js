const crypto=require("crypto");
const BugHuntTeam=require("../models/BugHuntTeam");
const TOKEN_LIFETIME_SECONDS=8*60*60;
const COORDINATOR_GRANT_SECONDS=4*60*60;
function secret(){const value=String(process.env.BUGHUNT_SECRET||process.env.ADMIN_SECRET||"");if(!value)throw new Error("BUGHUNT_SECRET is not configured");return value}
function safeEqual(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function sign(value){return crypto.createHmac("sha256",secret()).update(value).digest("base64url")}
function hashPassword(value){return crypto.createHmac("sha256",secret()).update(String(value)).digest("hex")}
function createSignedPayload(data,lifetimeSeconds){const now=Math.floor(Date.now()/1000),payload=Buffer.from(JSON.stringify({...data,iat:now,exp:now+lifetimeSeconds})).toString("base64url");return `${payload}.${sign(payload)}`}
function verifySignedPayload(token,role){try{const [payload,signature,extra]=String(token||"").split(".");if(!payload||!signature||extra||!safeEqual(signature,sign(payload)))return null;const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));if(data.role!==role||!data.teamId||!data.exp||data.exp<=Math.floor(Date.now()/1000))return null;return data}catch{return null}}
function createTeamToken(team){return createSignedPayload({teamId:team.teamId,event:"Bug Hunt",role:"bughunt-team"},TOKEN_LIFETIME_SECONDS)}
function verifyTeamToken(token){return verifySignedPayload(token,"bughunt-team")}
function createCoordinatorGrant(team){return createSignedPayload({teamId:team.teamId,event:"Bug Hunt",role:"bughunt-coordinator-grant"},COORDINATOR_GRANT_SECONDS)}
function verifyCoordinatorGrant(token,team){const data=verifySignedPayload(token,"bughunt-coordinator-grant");return Boolean(data&&team&&data.teamId===team.teamId)}
async function requireTeam(req,res,next){try{const auth=String(req.headers.authorization||"");if(!auth.startsWith("Bearer "))return res.status(401).json({message:"Team login required"});const data=verifyTeamToken(auth.slice(7));if(!data)return res.status(401).json({message:"Invalid or expired team session"});const team=await BugHuntTeam.findOne({teamId:data.teamId});if(!team)return res.status(401).json({message:"Team account not found"});req.bugHuntTeam=team;next()}catch(error){console.error("Bug Hunt auth error:",error);res.status(500).json({message:"Server error"})}}
module.exports={createTeamToken,hashPassword,requireTeam,safeEqual,createCoordinatorGrant,verifyCoordinatorGrant};
