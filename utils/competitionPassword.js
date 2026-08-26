const crypto = require("crypto");
function clean(value){return String(value??"").trim()}
function safeEqual(first,second){const a=Buffer.from(String(first)),b=Buffer.from(String(second));return a.length===b.length&&crypto.timingSafeEqual(a,b)}
function passwordBase(registration){
 const source=registration?.event==="Checkmate"?registration?.participant?.name:registration?.teamName;
 const firstWord=clean(source||"Team").split(/\s+/)[0].replace(/[^a-z0-9]/gi,"")||"Team";
 return firstWord.charAt(0).toUpperCase()+firstWord.slice(1).toLowerCase();
}
function makeCompetitionPassword(registration){
 const registrationId=clean(registration?.registrationId).toUpperCase();
 const compact=registrationId.replace(/[^A-Z0-9]/g,"");
 const lastFive=compact.slice(-5)||"00000";
 return `${passwordBase(registration)}@${lastFive}`;
}
module.exports={clean,safeEqual,makeCompetitionPassword};
