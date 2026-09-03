const mongoose=require("mongoose");
const securityEventSchema=new mongoose.Schema({
 reason:{type:String,default:""},detail:{type:String,default:""},at:{type:Date,default:Date.now},
 unlockedAt:{type:Date,default:null},unlockedBy:{type:String,default:""}
},{_id:false});
const schema=new mongoose.Schema({
 registrationId:{type:String,unique:true,required:true,uppercase:true,index:true},
 teamId:{type:String,unique:true,required:true,uppercase:true,index:true},
 teamName:{type:String,required:true,trim:true},members:{type:[String],default:[]},passwordHash:{type:String,required:true},enteredAt:{type:Date,default:null},
 currentRound:{type:String,enum:["waiting_start","round1","round2","round3","surprise","awaiting_ranking","final","eliminated","completed"],default:"waiting_start"},
 currentStage:{type:Number,default:1,min:1},progress:{type:mongoose.Schema.Types.Mixed,default:()=>({})},
 qualificationScore:{type:Number,default:0},finalScore:{type:Number,default:0},totalHintsUsed:{type:Number,default:0},
 wrongSubmissions:{type:Number,default:0},rank:{type:Number,default:null},rankSource:{type:String,enum:["auto","manual"],default:"auto"},finalPlace:{type:Number,default:null},finalPlaceSource:{type:String,enum:["auto","manual"],default:"auto"},
 security:{violations:{type:Number,default:0},locked:{type:Boolean,default:false},lockReason:{type:String,default:""},
 disqualified:{type:Boolean,default:false},events:{type:[securityEventSchema],default:[]}}
},{timestamps:true});
module.exports=mongoose.model("BugHuntTeam",schema);
