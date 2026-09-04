/* BYTEFEST 2026 - BUG HUNT v15 PATCH CHALLENGES
 * C + Python only. No MCQ answers and no expected output shown to participants.
 * Participants edit/submit the minimum patch. Hidden test status is returned without hidden inputs.
 */
const compact = v => String(v ?? "").toLowerCase().replace(/\s+/g, "").replace(/[;`]/g, "");
const hasAll = (v, parts) => { const s = compact(v); return parts.every(p => s.includes(compact(p))); };
const oneHint = text => [{ text, penalty: 10 }];
const result = checks => ({ correct: checks.every(Boolean), passed: checks.filter(Boolean).length, total: checks.length });

module.exports = {
  round1: { title: "Round 1 - Bug Radar", durationSeconds: 35 * 60, stages: [
    {
      id: "bh-r1-q1-negative-max", title: "Q1 - The Invisible Score", maxPoints: 30,
      prompt: `A scoreboard function behaves normally for common score sets. During judging, an all-negative batch returns 0 even though 0 was never submitted.\n\nPatch the implementation so the returned maximum always comes from valid input data. Keep the solution minimal.`,
      ui: { kind: "patch-editor", code: ["int findMax(int a[], int n) {", "    int best = 0;", "    for (int i = 0; i < n; i++)", "        if (a[i] > best) best = a[i];", "    return best;", "}"], sampleInput: "[-8, -3, -11, -2]", initialOutput: "0", patchLimit: "MINIMUM PATCH" },
      hints: oneHint("Consider whether the initial value is guaranteed to belong to the input."),
      evaluate: p => { const s = compact(p); return result([s.includes("best=a[0]") || s.includes("intbest=a[0]"), !s.includes("best=0"), s.includes("for") || s.includes("a[0]"), s.includes("returnbest")]); },
      run: p => ({ output: (compact(p).includes("best=a[0]") ? "-2" : "0"), note: "Sample execution only. No expected output is shown." })
    },
    {
      id: "bh-r1-q2-python-alias", title: "Q2 - The Mirrored Grid", maxPoints: 30,
      prompt: `A Python program creates a 3×3 grid. Changing one cell unexpectedly changes the same column in every row.\n\nPatch only the grid construction. Do not change the assignment that follows.`,
      ui: { kind: "patch-editor", code: ["grid = [[0] * 3] * 3", "grid[0][1] = 9", "print(grid)"], sampleInput: "No external input", initialOutput: "[[0, 9, 0], [0, 9, 0], [0, 9, 0]]", patchLimit: "CHANGE GRID CONSTRUCTION ONLY" },
      hints: oneHint("Ask whether all three rows are independent objects."),
      evaluate: p => { const s = compact(p); return result([s.includes("for") && s.includes("range(3)"), s.includes("[0]*3") || s.includes("[0,0,0]"), !s.includes("]*3*3"), s.includes("grid=")]); },
      run: p => ({ output: compact(p).includes("for") ? "[[0, 9, 0], [0, 0, 0], [0, 0, 0]]" : "[[0, 9, 0], [0, 9, 0], [0, 9, 0]]", note: "Sample execution only." })
    },
    {
      id: "bh-r1-q3-dangling-else", title: "Q3 - The Misleading Indent", maxPoints: 30,
      prompt: `The code below is formatted to suggest one control flow, but C follows a different one. For some values, the printed result surprises the developer.\n\nPatch the control structure so the intended outer if/else relationship is unambiguous.`,
      ui: { kind: "patch-editor", code: ["if (x > 5)", "    if (x < 8)", "        printf(\"A\");", "else", "    printf(\"B\");"], sampleInput: "x = 10", initialOutput: "B", patchLimit: "CONTROL-FLOW PATCH" },
      hints: oneHint("In C, an else binds to the nearest unmatched if."),
      evaluate: p => { const s = compact(p); return result([s.includes("if(x>5){") || s.includes("if(x>5)\n{") || s.includes("}"), s.includes("else"), s.includes("if(x<8)"), s.includes("printf")]); },
      run: p => ({ output: compact(p).includes("if(x>5){") ? "(no output for x=10 under the intended logic)" : "B", note: "Observe behavior; the site does not reveal an expected result." })
    },
    {
      id: "bh-r1-q4-python-remove", title: "Q4 - The Skipped Values", maxPoints: 30,
      prompt: `The goal is to remove every even number. The code appears simple, but consecutive matches can survive.\n\nPatch the logic without adding manual index bookkeeping.`,
      ui: { kind: "patch-editor", code: ["nums = [2, 4, 6, 7, 8]", "for x in nums:", "    if x % 2 == 0:", "        nums.remove(x)", "print(nums)"], sampleInput: "[2, 4, 6, 7, 8]", initialOutput: "[4, 7]", patchLimit: "NO MANUAL INDEX COUNTER" },
      hints: oneHint("Changing a list while iterating over that same list can skip elements."),
      evaluate: p => { const s = compact(p); return result([(s.includes("forxinnums[:]") || s.includes("forxinnums.copy()") || s.includes("[xforxinnumsifx%2!=0]")), !s.includes("forxinnums:") || s.includes("nums[:]") || s.includes("copy"), s.includes("%2"), s.includes("nums")]); },
      run: p => ({ output: (compact(p).includes("nums[:]") || compact(p).includes("copy") || compact(p).includes("ifx%2!=0")) ? "[7]" : "[4, 7]", note: "Sample execution only." })
    }
  ]},

  round2: { title: "Round 2 - Patch It", durationSeconds: 40 * 60, stages: [
    {
      id: "bh-r2-q1-binary-search", title: "Q1 - The Search That Never Shrinks", maxPoints: 35,
      prompt: `A search service passes many requests but can remain active forever when the target is absent. Logs show the same middle position being revisited.\n\nSubmit the minimum patch that guarantees the search interval strictly shrinks after every failed comparison.`,
      ui: { kind: "patch-editor", code: ["int search(int a[], int n, int target) {", "    int low = 0, high = n - 1;", "    while (low <= high) {", "        int mid = low + (high - low) / 2;", "        if (a[mid] == target) return mid;", "        if (a[mid] < target) low = mid;", "        else high = mid;", "    }", "    return -1;", "}"], sampleInput: "sorted array; target absent", initialOutput: "request does not finish for a boundary case", patchLimit: "CHANGE ONLY TWO ASSIGNMENTS" },
      hints: oneHint("Once mid is known to be wrong, it must not remain inside the next interval."),
      evaluate: p => { const s = compact(p); return result([s.includes("low=mid+1"), s.includes("high=mid-1"), s.includes("while(low<=high)"), s.includes("return-1")]); },
      run: p => ({ output: hasAll(p,["low=mid+1","high=mid-1"]) ? "request completes" : "request may repeat the same midpoint", note: "Sample behavior only." })
    },
    {
      id: "bh-r2-q2-prime-guard", title: "Q2 - The Empty Loop", maxPoints: 35,
      prompt: `A prime checker passes ordinary positive-number tests. A hidden validation family contains values for which the loop executes zero times, and the function incorrectly returns True.\n\nAdd one guard that fixes the complete invalid family without changing the loop.`,
      ui: { kind: "patch-editor", code: ["def is_prime(n):", "    for i in range(2, n):", "        if n % i == 0:", "            return False", "    return True"], sampleInput: "n = 1", initialOutput: "True", patchLimit: "ADD ONE GUARD" },
      hints: oneHint("Prime numbers start at 2."),
      evaluate: p => { const s = compact(p); return result([s.includes("ifn<2"), s.includes("returnfalse"), s.includes("defis_prime"), s.includes("foriinrange(2,n)")]); },
      run: p => ({ output: hasAll(p,["ifn<2","returnfalse"]) ? "False" : "True", note: "Sample execution only." })
    },
    {
      id: "bh-r2-q3-c-string", title: "Q3 - It Printed Correctly Once", maxPoints: 35,
      prompt: `A five-character code sometimes prints correctly and sometimes continues into garbage memory. The same binary behaves differently between machines.\n\nPatch the storage so the string is always valid for %s printing.`,
      ui: { kind: "patch-editor", code: ["char code[5] = \"HELLO\";", "printf(\"%s\", code);"], sampleInput: "No external input", initialOutput: "HELLO... (may continue into garbage)", patchLimit: "MINIMUM STORAGE PATCH" },
      hints: oneHint("C strings need room for one character that is not visibly printed."),
      evaluate: p => { const s = compact(p); return result([s.includes("charcode[6]") || s.includes("charcode[]=\"hello\"") , s.includes("\"hello\""), s.includes("printf(\"%s\",code)"), !s.includes("charcode[5]")]); },
      run: p => ({ output: (compact(p).includes("code[6]") || compact(p).includes("code[]=\"hello\"")) ? "HELLO" : "HELLO... (memory-dependent)", note: "Sample behavior only." })
    },
    {
      id: "bh-r2-q4-python-truthiness", title: "Q4 - Zero Is Valid", maxPoints: 35,
      prompt: `A validation function should reject missing values, but numeric zero is valid data. The current implementation rejects a record containing 0.\n\nPatch the predicate so only missing values are rejected.`,
      ui: { kind: "patch-editor", code: ["def valid(items):", "    return all(items)", "", "print(valid([12, 0, 7]))"], sampleInput: "[12, 0, 7]", initialOutput: "False", patchLimit: "KEEP THE FUNCTION SHORT" },
      hints: oneHint("Truthiness is broader than 'is missing'."),
      evaluate: p => { const s = compact(p); return result([s.includes("isnotnone"), s.includes("for") && s.includes("initems"), s.includes("all("), !s.includes("returnall(items)")]); },
      run: p => ({ output: compact(p).includes("isnotnone") ? "True" : "False", note: "Sample execution only." })
    }
  ]},

  round3: { title: "Round 3 - Hidden Failure", durationSeconds: 50 * 60, stages: [
    {
      id: "bh-r3-q1-size-t-loop", title: "Q1 - Countdown That Never Ends", maxPoints: 40,
      prompt: `A reverse traversal works for several values, but a production run appears to continue forever after reaching index 0. The index type is size_t.\n\nPatch the loop so reverse traversal terminates safely for every valid n > 0.`,
      ui: { kind: "patch-editor", code: ["for (size_t i = n - 1; i >= 0; i--) {", "    process(a[i]);", "}"], sampleInput: "n = 4", initialOutput: "processes 3,2,1,0 then continues", patchLimit: "SAFE REVERSE LOOP" },
      hints: oneHint("size_t is unsigned; ask what happens below zero."),
      evaluate: p => { const s = compact(p); return result([(s.includes("i-->0") || s.includes("i>0") || s.includes("i=n;i-->0")), !s.includes("i>=0"), s.includes("size_t") || s.includes("for("), s.includes("process")]); },
      run: p => ({ output: (compact(p).includes("i-->0") || compact(p).includes("i>0")) ? "reverse traversal terminates" : "index wraps after zero", note: "Sample behavior only." })
    },
    {
      id: "bh-r3-q2-python-default", title: "Q2 - Data From the Previous Call", maxPoints: 40,
      prompt: `A helper works on the first request. A later request unexpectedly contains values from the previous call even though no global variable is used.\n\nPatch the function so each call gets independent storage unless the caller explicitly provides a list.`,
      ui: { kind: "patch-editor", code: ["def collect(x, bucket=[]):", "    bucket.append(x)", "    return bucket", "", "print(collect(1))", "print(collect(2))"], sampleInput: "collect(1), collect(2)", initialOutput: "[1] then [1, 2]", patchLimit: "PRESERVE OPTIONAL ARGUMENT BEHAVIOR" },
      hints: oneHint("Default argument objects are created once, not once per call."),
      evaluate: p => { const s = compact(p); return result([s.includes("bucket=none"), s.includes("ifbucketisnone"), s.includes("bucket=[]"), s.includes("bucket.append(x)")]); },
      run: p => ({ output: hasAll(p,["bucket=none","ifbucketisnone","bucket=[]"]) ? "[1] then [2]" : "[1] then [1, 2]", note: "Sample execution only." })
    },
    {
      id: "bh-r3-q3-c-string-compare", title: "Q3 - Same Text, Different Result", maxPoints: 40,
      prompt: `Two strings visibly contain the same text, but a permission check sometimes treats them as different. The values may come from separate buffers.\n\nPatch the comparison so it checks string contents rather than storage addresses.`,
      ui: { kind: "patch-editor", code: ["char roleA[16] = \"admin\";", "char roleB[16];", "strcpy(roleB, \"admin\");", "", "if (roleA == roleB)", "    grant_access();"], sampleInput: "roleA='admin', roleB='admin'", initialOutput: "access may not be granted", patchLimit: "CHANGE THE COMPARISON" },
      hints: oneHint("Arrays/pointers compared with == do not compare every character."),
      evaluate: p => { const s = compact(p); return result([s.includes("strcmp(rolea,roleb)==0") || s.includes("!strcmp(rolea,roleb)"), s.includes("strcmp"), !s.includes("rolea==roleb"), s.includes("grant_access")]); },
      run: p => ({ output: compact(p).includes("strcmp") ? "access granted" : "comparison depends on addresses", note: "Sample behavior only." })
    },
    {
      id: "bh-r3-q4-python-float", title: "Q4 - The Number That Is Almost 0.3", maxPoints: 40,
      prompt: `A price check occasionally fails even though the displayed arithmetic looks exact.\n\nPatch the comparison so normal floating-point representation error does not reject equivalent values.`,
      ui: { kind: "patch-editor", code: ["total = 0.1 + 0.2", "if total == 0.3:", "    print(\"accepted\")", "else:", "    print(\"rejected\")"], sampleInput: "0.1 + 0.2", initialOutput: "rejected", patchLimit: "ROBUST NUMERIC COMPARISON" },
      hints: oneHint("Binary floating-point cannot represent every decimal fraction exactly."),
      evaluate: p => { const s = compact(p); return result([(s.includes("isclose") || s.includes("abs(total-0.3)<")), (s.includes("math.isclose") || s.includes("abs(")), !s.includes("total==0.3"), s.includes("accepted")]); },
      run: p => ({ output: (compact(p).includes("isclose") || compact(p).includes("abs(total-0.3)<")) ? "accepted" : "rejected", note: "Sample execution only." })
    }
  ]},

  surprise: { title: "Surprise Bug Drop", durationSeconds: 20 * 60, stages: [
    {
      id: "bh-surprise-lambda", title: "Surprise - Three Functions, One Value", maxPoints: 60,
      prompt: `Three Python callbacks are created in a loop. The developer expects each callback to remember the loop value from the moment it was created, but all callbacks later return the same value.\n\nPatch the callback construction without changing how the callbacks are invoked.`,
      ui: { kind: "patch-editor", code: ["funcs = []", "for i in range(3):", "    funcs.append(lambda: i)", "", "print([f() for f in funcs])"], sampleInput: "range(3)", initialOutput: "[2, 2, 2]", patchLimit: "CHANGE CALLBACK CONSTRUCTION ONLY" },
      hints: oneHint("The lambda reads i later; capture the current value at creation time."),
      evaluate: p => { const s = compact(p); return result([s.includes("lambdai=i:i") || s.includes("lambda",), s.includes("i=i"), s.includes("funcs.append"), !s.includes("lambda:i)")]); },
      run: p => ({ output: compact(p).includes("i=i") ? "[0, 1, 2]" : "[2, 2, 2]", note: "Sample execution only." })
    }
  ]},

  final: { title: "Final - Critical Debug", durationSeconds: 15 * 60, stages: [
    {
      id: "bh-final-second-largest", title: "Final - Second Largest Distinct", maxPoints: 100,
      prompt: `The function below should return the second-largest DISTINCT value. It fails on negative values, duplicates, small arrays and some ordinary inputs.\n\nRepair the implementation. Hidden tests include duplicates, all-negative data, one-element input, all-equal input and extreme integer values.`,
      ui: { kind: "patch-editor", code: ["int secondLargest(int a[], int n) {", "    int largest = 0, second = 0;", "    for (int i = 1; i <= n; i++) {", "        if (a[i] > largest) {", "            largest = a[i];", "            second = largest;", "        }", "    }", "    return second;", "}"], sampleInput: "multiple hidden datasets", initialOutput: "fails several edge cases", patchLimit: "FULL REPAIR ALLOWED" },
      hints: oneHint("Fix the boundary and preserve the old largest before replacing it; then handle distinct/no-result cases."),
      evaluate: p => { const s = compact(p); return result([
        s.includes("i<n"),
        (s.includes("int_min") || s.includes("a[0]") || s.includes("haslargest") || s.includes("bool")),
        (s.includes("second=largest") && (s.indexOf("second=largest") < s.lastIndexOf("largest="))) || s.includes("oldlargest") || s.includes("temp"),
        (s.includes("!=largest") || s.includes("<largest") || s.includes("distinct")),
        (s.includes("return") && (s.includes("-1") || s.includes("error") || s.includes("hassecond") || s.includes("bool")))
      ]); },
      run: p => ({ output: "Sample run completed. Final correctness is decided only by hidden tests on SUBMIT PATCH.", note: "No expected output or hidden inputs are disclosed." })
    }
  ]}
};
