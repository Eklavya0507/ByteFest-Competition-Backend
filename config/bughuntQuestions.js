/*
 * BYTEFEST 2026 - BUG HUNT QUESTION BANK
 * ------------------------------------------------------------
 * Replace questions, answers, points and hints ONLY in this file.
 * The website / routes do not need to be rewritten when questions change.
 * Current content is a temporary test bank.
 */
const HINTS = [10,20,30];
function hints(a,b,c){return [{text:a,penalty:HINTS[0]},{text:b,penalty:HINTS[1]},{text:c,penalty:HINTS[2]}];}
module.exports={
 round1:{title:"Round 1 - Bug Radar",durationSeconds:35*60,stages:[
  {id:"bh-r1s1",title:"Stage 1 - Spot the Issue",maxPoints:100,prompt:"The loop should print 1 to 5, but the condition is written i < 5. What should the condition be? Enter only the corrected condition.",placeholder:"Example: i <= 5",answers:["i <= 5","i<=5"],hints:hints("The current loop stops before 5.","Think about inclusive comparison.","Use <= instead of <.")},
  {id:"bh-r1s2",title:"Stage 2 - Trace the Output",maxPoints:100,prompt:"Code: x=2; for i in range(3): x=x+i; print(x). What number is printed?",placeholder:"Final output",answers:["5"],hints:hints("range(3) gives 0,1,2.","Update x after each value.","2+0+1+2 = 5.")},
  {id:"bh-r1s3",title:"Stage 3 - Find & Correct",maxPoints:100,prompt:"A condition meant to detect an even number is written n % 2 == 1. Enter the corrected condition only.",placeholder:"Correct condition",answers:["n % 2 == 0","n%2==0"],hints:hints("Even division by 2 leaves a different remainder.","The remainder should not be 1.","Use remainder 0.")}
 ]},
 round2:{title:"Round 2 - Patch It",durationSeconds:40*60,stages:[
  {id:"bh-r2s1",title:"Stage 1 - Diagnose",maxPoints:120,prompt:"A program calculates average as sum / (count - 1). The list contains exactly count values. What expression should replace the denominator?",placeholder:"Correct denominator/expression",answers:["count","sum / count","sum/count"],hints:hints("The divisor should equal how many values exist.","No value is being excluded.","Use count.")},
  {id:"bh-r2s2",title:"Stage 2 - Repair",maxPoints:130,prompt:"Code intends to find the largest value: maxVal=0; for x in [-8,-3,-12]: if x>maxVal: maxVal=x. What should maxVal be initialized to so the logic works for this list? Enter the value.",placeholder:"Initial value",answers:["-8"],hints:hints("0 is larger than every list value.","Initialize using an actual list element.","Use the first element.")}
 ]},
 round3:{title:"Round 3 - Hidden Failure",durationSeconds:50*60,stages:[
  {id:"bh-r3s1",title:"Stage 1 - Hidden Case",maxPoints:150,prompt:"A binary-search loop uses while low < high and misses checking the final remaining position. What comparison should be used instead?",placeholder:"Correct comparison",answers:["low <= high","low<=high"],hints:hints("The final position must still be checked.","The loop should continue when low equals high.","Use <=.")},
  {id:"bh-r3s2",title:"Stage 2 - Multi-Bug Challenge",maxPoints:150,prompt:"A function should return the sum 1..n but uses total=1 and loops i from 1 through n adding i. What should total start at?",placeholder:"Initial total",answers:["0"],hints:hints("The loop already adds 1.","Starting with 1 counts it twice.","Initialize the accumulator to zero.")}
 ]},
 surprise:{title:"Surprise Bug Drop",durationSeconds:20*60,stages:[
  {id:"bh-surprise",title:"System Alert - Surprise Bug Drop",maxPoints:200,prompt:"A password checker rejects a correct 8-character password because it tests len(password) > 8. What comparison should allow passwords of at least 8 characters?",placeholder:"Correct comparison",answers:["len(password) >= 8","len(password)>=8"],hints:hints("Eight itself must pass.","Use an inclusive comparison.","Use >= 8.")}
 ]},
 final:{title:"Final - Critical Debug",durationSeconds:15*60,stages:[
  {id:"bh-final",title:"Critical Debug",maxPoints:250,prompt:"A function should return the last valid index of an array of length n, but it returns n. Enter the correct expression for the last valid index.",placeholder:"Correct expression",answers:["n - 1","n-1"],hints:hints("Array indexing starts at zero.","Length n means indices 0 through n-1.","Return n-1.")}
 ]}
};
