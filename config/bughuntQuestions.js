/*
 * BYTEFEST 2026 - BUG HUNT FINAL SELECTED QUESTION BANK (v9 LOGICAL/MOBILE)
 * Mixed code + flowchart + state + logs + hidden-requirement questions.
 */
const HINTS=[10,20,30];
const hints=(a,b,c)=>[
  {text:a,penalty:HINTS[0]},
  {text:b,penalty:HINTS[1]},
  {text:c,penalty:HINTS[2]}
];
const compact=v=>String(v??"").toLowerCase().replace(/\s+/g,"").replace(/[;`]/g,"");
const includesAll=(v,parts)=>{const s=compact(v);return parts.every(p=>s.includes(compact(p)))};

module.exports={
 round1:{title:"Round 1 - Bug Radar",durationSeconds:35*60,stages:[
  {
   id:"bh-r1-q1-negative-max",title:"Q1 - Negative Maximum",type:"faulty-line",maxPoints:20,
   prompt:`A scoreboard service works for ordinary scores, but a judge reports this failure:

Input scores: [-8,-3,-11,-2]
Expected winner score: -2
Service returns: 0

Code:
int findMax(int a[], int n) {
    int max = 0;
    for (int i=0; i<n; i++)
        if (a[i] > max) max = a[i];
    return max;
}

Which line/idea creates a value that was never in the contest, and why?`,
   placeholder:"Example: line 2 or max=0",answers:["line 2","2","max=0","int max = 0"],
   hints:hints("Look at a value that never appears in the input.","Ask whether max=0 is safe for every possible array.","Initialize from a[0] or a safe lower value."),
   ui:{kind:"code-lines",code:["int findMax(int a[], int n) {","  int max = 0;","  for (int i=0; i<n; i++) {","    if (a[i] > max)","      max = a[i];","  }","  return max;","}"],choices:["Line 2","Line 3","Line 4","Line 5"]}
  },
  {
   id:"bh-r1-q2-test-expectation",title:"Q2 - Bug or No Bug",type:"bug-or-no-bug",maxPoints:20,
   prompt:`A QA report flags this function as broken:

def average(a,b):
    return (a+b)/2

For a=5 and b=8 the program returns 6.5, but the test file expects 6.

The specification only says “ordinary arithmetic mean.”

Where is the bug: code, test expectation, or nowhere?`,
   placeholder:"A, B or C",answers:["b","test expectation bug","test bug"],
   hints:hints("Calculate the arithmetic mean manually.","Check whether integer truncation was required.","The test expectation can be wrong too."),
   ui:{kind:"choices",choices:["A - Code bug","B - Test expectation bug","C - No bug"]}
  },
  {
   id:"bh-r1-q3-flowchart-even",title:"Q3 - Flowchart Fault",type:"flowchart-fault",maxPoints:20,
   prompt:`A sensor flowchart should label every integer EVEN or ODD. The decision diamond asks “n % 2 == 0 ?” but the YES wire reaches PRINT ODD and the NO wire reaches PRINT EVEN.

With n=8 the decision is TRUE and the wrong label appears.

Do you change the condition, the outputs, or the wires?`,
   placeholder:"Example: swap branches",answers:["swap branches","swap outputs","yes even no odd","yes->even no->odd"],
   hints:hints("The decision expression is correct.","For n=8 the decision is TRUE.","YES must lead to EVEN."),
   ui:{kind:"flowchart",nodes:["READ n","n % 2 == 0 ?","YES -> PRINT ODD","NO -> PRINT EVEN"],choices:["Swap output branches","Change condition to n%2==1","No bug"]}
  },
  {
   id:"bh-r1-q4-off-by-one",title:"Q4 - Boundary Trap",type:"faulty-line",maxPoints:20,
   prompt:`A three-sample packet [4,6,2] is passed to sumArray with n=3. The expected sum is 12, but the program sometimes reads garbage after the last sample:

for (int i=0; i<=n; i++) total += a[i];

Find the smallest boundary fix that guarantees the loop touches only real samples.`,
   placeholder:"Correct loop condition",answers:["i < n","i<n","for(int i=0;i<n;i++)"],
   hints:hints("Valid indices are 0,1,2.","What happens when i becomes 3?","The fix changes <= to <."),
   ui:{kind:"code-lines",code:["int total = 0;","for (int i = 0; i <= n; i++) {","  total += a[i];","}"],choices:["i < n","i <= n-1","i < n-1"]}
  }
 ]},
 round2:{title:"Round 2 - Patch It",durationSeconds:40*60,stages:[
  {
   id:"bh-r2-q1-binary-search",title:"Q1 - Binary Search Stuck",type:"minimal-patch",maxPoints:25,
   prompt:`A search tracker occasionally freezes even though low and high are still valid. The trace shows the same mid appearing again and again.

if (a[mid] < key) low = mid;
else high = mid;

You may change only these two assignments. What patch guarantees that each failed comparison removes mid from the next search interval?`,
   placeholder:"low=... , high=...",answers:[],
   validate:(a)=>includesAll(a,["low=mid+1","high=mid-1"]),
   hints:hints("The search interval sometimes does not shrink.","If mid is wrong, exclude it from the next interval.","Move one position beyond mid."),
   ui:{kind:"patch",code:["if (a[mid] < key)","  low = mid;","else","  high = mid;"],fields:["low = ?","high = ?"]}
  },
  {
   id:"bh-r2-q2-prime-hidden-input",title:"Q2 - Test Case Detective",type:"test-case-detective",maxPoints:25,
   prompt:`A prime checker passes tests for 2, 7 and 9. The specification quietly adds one rule: every n<2 is NOT prime.

def is_prime(n):
    for i in range(2,n):
        if n%i==0: return False
    return True

Among 2,7,9,1 choose the value that exposes the hidden failure, then add the smallest guard that fixes the entire n<2 family.`,
   placeholder:"Example: 1 | if n < 2: return False",answers:[],
   validate:(a)=>{const s=compact(a);return s.includes("1")&&s.includes("n<2")&&s.includes("returnfalse")},
   hints:hints("Try a value where the loop does not execute.","9 is correctly rejected by divisor 3.","The requirement explicitly mentions n<2."),
   ui:{kind:"choices",choices:["2","7","9","1"],note:"After choosing the input, add the one-line guard in the answer box."}
  },
  {
   id:"bh-r2-q3-lock-threshold",title:"Q3 - State Machine Patch",type:"state-table-patch",maxPoints:25,
   prompt:`A login system promises: “the third consecutive failure locks the account immediately.” The audit trail says ACTIVE after failures 1, 2 and 3, then LOCKED after failure 4.

Current rule: after incrementing failed, lock only when failed > 3.

What single comparison change makes the audit match the promise?`,
   placeholder:"Correct condition",answers:["failed >= 3","failed>=3","if failed >= 3","if failed>=3"],
   hints:hints("The lock happens one failure too late.","Look at the exact boundary value 3.","The update is correct; the comparison is not."),
   ui:{kind:"state-table",rows:[["1","ACTIVE"],["2","ACTIVE"],["3","ACTIVE (wrong)"],["4","LOCKED"]],choices:["failed >= 3","failed == 4","failed > 2"]}
  },
  {
   id:"bh-r2-q4-even-median",title:"Q4 - Median Index Patch",type:"minimal-patch",maxPoints:25,
   prompt:`A statistics service already sorts its data. For [2,4,8,10] it reports median 9 instead of 6.

mid=n/2
return (a[mid] + a[mid+1]) / 2.0

The formula for averaging two values is fine. Which two zero-based indices should be used when n is even?`,
   placeholder:"Correct return expression",answers:[],
   validate:(a)=>{const s=compact(a);return s.includes("a[mid-1]")&&s.includes("a[mid]")&&s.includes("2.0")},
   hints:hints("For four values the middle pair is 4 and 8.","mid is 2 when n=4.","The middle indices are 1 and 2."),
   ui:{kind:"patch",code:["mid = n / 2","return (a[mid] + a[mid+1]) / 2.0"],fields:["left index = ?","right index = ?"]}
  }
 ]},
 round3:{title:"Round 3 - Hidden Failure",durationSeconds:50*60,stages:[
  {
   id:"bh-r3-q1-username-normalize",title:"Q1 - Hidden Requirement",type:"hidden-requirement",maxPoints:30,
   prompt:`A duplicate-name guard is bypassed by the new registration "  alice  " even though “Alice” already exists. The written rule says outer spaces do not matter and letter case does not matter.

What normalization must happen before the duplicate comparison?`,
   placeholder:"Describe the normalization",answers:[],
   validate:(a)=>{const s=compact(a);return (s.includes("trim")||s.includes("strip"))&&(s.includes("lower")||s.includes("case"))},
   hints:hints("Remove outside spaces first.","Alice and alice should be equivalent.","Normalize both stored and incoming usernames."),
   ui:{kind:"cards",cards:["Existing: Alice","Existing: debugger","Existing: BYTEKING","Incoming:   alice  "],choices:["trim only","lowercase only","trim + case normalize"]}
  },
  {
   id:"bh-r3-q2-zero-history-log",title:"Q2 - Log Investigation",type:"log-investigation",maxPoints:30,
   prompt:`Two users reach the same history endpoint. One has 3 records and gets avg=71.3. The other has 0 records and immediately triggers “division by zero.”

Nothing else fails in the request. From the log alone, identify the broken assumption and the safe guard point.`,
   placeholder:"Root cause",answers:["count=0","count = 0","division by zero","records=0","empty history"],
   hints:hints("The failure happens immediately after records=0.","The profile request succeeds.","Any division needs a non-zero denominator."),
   ui:{kind:"logs",lines:["records=3 -> avg 71.3","records=0 -> ERROR division by zero"],choices:["count=0","bad token","timeout","null id"]}
  },
  {
   id:"bh-r3-q3-multi-bug-sumeven",title:"Q3 - Multi-Bug Challenge",type:"multi-bug",maxPoints:30,
   prompt:`int sumEven(int a[], int n) {\n    int sum;\n    for (int i = 0; i <= n; i++) {\n        if (a[i] % 2 = 0)\n            sum += a[i];\n    }\n    return sum;\n}\n\nFind ALL bugs. Enter the three corrected ideas/expressions.`,
   placeholder:"sum=... ; i...n ; %2 ... 0",answers:[],
   validate:(a)=>{const s=compact(a);return s.includes("sum=0")&&(s.includes("i<n")||s.includes("i<=n-1"))&&s.includes("%2==0")},
   hints:hints("There is an initialization bug.","There is a boundary bug.","There is an operator bug inside the if."),
   ui:{kind:"code-lines",code:["int sum;","for (int i=0; i<=n; i++) {","if (a[i] % 2 = 0)","sum += a[i];"],multiSelect:true}
  },
  {
   id:"bh-r3-q4-palindrome-normalize",title:"Q4 - Hidden Text Case",type:"hidden-test",maxPoints:30,
   prompt:`The palindrome core passes “level”, “radar” and correctly rejects “hello”, yet a hidden sentence “Never odd or even” fails even though the requirement says spaces and case must be ignored.

What preprocessing must happen before the existing reverse comparison?`,
   placeholder:"Normalization step",answers:[],
   validate:(a)=>{const s=compact(a);return (s.includes("lower")||s.includes("case"))&&(s.includes("space")||s.includes("replace")||s.includes("remove"))},
   hints:hints("The reverse comparison itself is fine.","Look at spaces and uppercase letters.","Normalize the string first."),
   ui:{kind:"test-results",visible:["level PASS","radar PASS","hello PASS"],hidden:["Never odd or even FAIL"]}
  }
 ]},
 surprise:{title:"Surprise Bug Drop",durationSeconds:20*60,stages:[
  {
   id:"bh-surprise-int-overflow",title:"Extreme Value Incident",type:"incident-diagnosis",maxPoints:50,
   prompt:`A production counter passes 99 tests, then this incident appears:

2147483647 + 1
Expected: 2147483648
Actual: -2147483648

Nothing loops and no input is null. Name the failure class and the safe general mitigation.`,
   placeholder:"Root cause",answers:["overflow","integer overflow","32-bit overflow","32 bit overflow"],
   hints:hints("2147483647 is a familiar boundary.","The result wraps to the most negative 32-bit value.","Think about integer range."),
   ui:{kind:"choices",choices:["overflow","off-by-one","null value","loop bug"],note:"Mitigation: wider or checked arithmetic."}
  }
 ]},
 final:{title:"Final - Critical Debug",durationSeconds:15*60,stages:[
  {
   id:"bh-final-second-largest",title:"Critical Debug - Second Largest Distinct",type:"critical-debug",maxPoints:100,
   prompt:`int secondLargest(int a[], int n) {\n    int largest = 0, second = 0;\n    for (int i = 1; i <= n; i++) {\n        if (a[i] > largest) {\n            largest = a[i];\n            second = largest;\n        }\n    }\n    return second;\n}\n\nVisible tests:\n[8,6,7] -> 7\n[-4,-2,-9] -> -4\n[5,5,4] -> 4\n\nHidden tests: single value, all equal, extreme negative values.\n\nEnter a compact repair summary covering ALL connected bugs.`,
   placeholder:"Example: safe init; i<n; preserve old largest; ...",answers:[],
   validate:(a)=>{const s=compact(a);const boundary=s.includes("i<n")||s.includes("loopbound");const safe=s.includes("safeinit")||s.includes("sentinel")||s.includes("a[0]")||s.includes("flag");const preserve=s.includes("oldlargest")||s.includes("preserve")||s.includes("second=largestbefore")||s.includes("updateorder");const distinct=s.includes("distinct")||s.includes("x<largest")||s.includes("duplicate");const noSecond=s.includes("nosecond")||s.includes("notexist")||s.includes("error")||s.includes("flag");return boundary&&safe&&preserve&&distinct&&noSecond},
   hints:hints("The loop reads one element past the array.","When largest changes, preserve the OLD largest first.","You also need distinct handling and a no-second case."),
   ui:{kind:"critical",code:["largest=0, second=0","for (i=1; i<=n; i++)","if a[i]>largest","largest=a[i]","second=largest"],tests:["[8,6,7] FAIL","[-4,-2,-9] FAIL","[5,5,4] FAIL","hidden edge cases LOCKED"]}
  }
 ]}
};
