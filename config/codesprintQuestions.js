/*
 * BYTEFEST 2026 - CODE SPRINT QUESTION BANK
 * ------------------------------------------------------------
 * EDIT ONLY THIS FILE when you want to replace questions later.
 * Correct answers live ONLY on the backend and are never sent to
 * participant browsers.
 *
 * Supported answer type in this first build: short-answer.
 * All comparisons ignore surrounding spaces and letter case.
 */

const COMMON_HINT_PENALTIES = [10, 20, 30];

function hints(first, second, third) {
    return [
        { text: first, penalty: COMMON_HINT_PENALTIES[0] },
        { text: second, penalty: COMMON_HINT_PENALTIES[1] },
        { text: third, penalty: COMMON_HINT_PENALTIES[2] }
    ];
}

module.exports = {
    round1: {
        title: "Round 1 - League",
        timeLimitSeconds: 60 * 60,
        stages: [
            {
                id: "r1s1",
                title: "Stage 1 - Logic Challenge",
                type: "short-answer",
                maxPoints: 30,
                speedMeasured: false,
                prompt: "Observe the sequence: 2, 6, 12, 20, 30, ?. Enter only the next number.",
                placeholder: "Enter the next number",
                answers: ["42"],
                organizerAnswer: "42",
                hints: hints(
                    "Look at how each term is built from two consecutive numbers.",
                    "Try 1×2, 2×3, 3×4, 4×5 and 5×6.",
                    "The next term is 6×7."
                )
            },
            {
                id: "r1s2",
                title: "Stage 2 - Predict the Output",
                type: "short-answer",
                maxPoints: 30,
                speedMeasured: false,
                prompt: "Without running it, find the final output: x = 3; y = 4; x = x * y; y = x // y + 2; print(x + y). Enter only the number.",
                placeholder: "Final output",
                answers: ["17"],
                organizerAnswer: "17",
                hints: hints(
                    "Evaluate the statements from top to bottom; x changes before y is recalculated.",
                    "After x = x * y, x becomes 12.",
                    "Then y becomes 12 // 4 + 2."
                )
            },
            {
                id: "r1s3",
                title: "Stage 3 - Linked Memory Challenge",
                type: "short-answer",
                maxPoints: 40,
                speedMeasured: true,
                prompt: "Let A be your answer from Stage 1 and B be your answer from Stage 2. Compute (A - B) × 3. Previous stages cannot be reopened. Enter only the final number.",
                placeholder: "Final number",
                answers: ["75"],
                organizerAnswer: "75",
                hints: hints(
                    "You need the two results you obtained earlier in this round.",
                    "Stage 1's result was larger than Stage 2's result.",
                    "Use A = 42 and B = 17, then apply the expression."
                )
            }
        ]
    },

    round2: {
        title: "Round 2 - League",
        timeLimitSeconds: 60 * 60,
        stages: [
            {
                id: "r2s1",
                title: "Stage 1 - Algorithm Thinking",
                type: "short-answer",
                maxPoints: 30,
                speedMeasured: false,
                prompt: "A nested process runs the inner action i times for each i from 1 through 6. How many total times does the inner action execute? Enter only the number.",
                placeholder: "Total executions",
                answers: ["21"],
                organizerAnswer: "21",
                hints: hints(
                    "Add the number of executions for each value of i.",
                    "The total is 1 + 2 + 3 + 4 + 5 + 6.",
                    "Use n(n+1)/2 with n = 6."
                )
            },
            {
                id: "r2s2",
                title: "Stage 2 - Output Reasoning",
                type: "short-answer",
                maxPoints: 30,
                speedMeasured: false,
                prompt: "Consider the values 1, 2, 3, 4, 5. Square only the even values and add those squares. Enter only the final sum.",
                placeholder: "Final sum",
                answers: ["20"],
                organizerAnswer: "20",
                hints: hints(
                    "Ignore odd values first.",
                    "The even values are 2 and 4.",
                    "Calculate 2² + 4²."
                )
            },
            {
                id: "r2s3",
                title: "Stage 3 - Linked Memory Challenge",
                type: "short-answer",
                maxPoints: 40,
                speedMeasured: true,
                prompt: "Let A be your Stage 1 answer and B be your Stage 2 answer. Add A + B, then convert that decimal result to binary. Enter only the binary digits.",
                placeholder: "Binary answer",
                answers: ["101001"],
                organizerAnswer: "101001",
                hints: hints(
                    "First recover both earlier answers and add them.",
                    "A + B equals 41.",
                    "41 = 32 + 8 + 1 in powers of two."
                )
            }
        ]
    },

    qualifier: {
        title: "Qualifier - One Big Challenge",
        timeLimitSeconds: 45 * 60,
        stages: [
            {
                id: "qualifier",
                title: "Qualifier Challenge",
                type: "short-answer",
                maxPoints: 100,
                speedMeasured: true,
                prompt: "A system starts with value 5. Repeat this operation 4 times: multiply the current value by 2, then add the step number (1 for the first step, 2 for the second, and so on). After step 4, subtract 5. Enter the final value only.",
                placeholder: "Final value",
                answers: ["101"],
                organizerAnswer: "101",
                hints: hints(
                    "Work one step at a time and keep the updated value.",
                    "The first two updated values are 11 and 24.",
                    "Continue: step 3 gives 51, step 4 gives 106 before the final subtraction instruction is applied carefully. Re-read the wording."
                )
            }
        ]
    },

    semifinal: {
        title: "Semifinal",
        timeLimitSeconds: 35 * 60,
        stages: [
            {
                id: "semifinal",
                title: "Semifinal Challenge",
                type: "short-answer",
                maxPoints: 100,
                speedMeasured: true,
                prompt: "In the worst case, how many pair comparisons are made by standard Bubble Sort on 8 elements when using the usual shrinking inner loop? Enter only the number.",
                placeholder: "Comparisons",
                answers: ["28"],
                organizerAnswer: "28",
                hints: hints(
                    "The number of comparisons decreases by one after each pass.",
                    "Add 7 + 6 + 5 + 4 + 3 + 2 + 1.",
                    "Use n(n-1)/2 for n = 8."
                )
            }
        ]
    },

    wildcard: {
        title: "Wildcard Entry",
        timeLimitSeconds: 35 * 60,
        stages: [
            {
                id: "wildcard",
                title: "Wildcard Entry Challenge",
                type: "short-answer",
                maxPoints: 100,
                speedMeasured: true,
                prompt: "Start at 1. Apply the operation x = 2x + 1 exactly 5 times. Enter the final value.",
                placeholder: "Final value",
                answers: ["63"],
                organizerAnswer: "63",
                hints: hints(
                    "Write the value after each operation.",
                    "The first three values are 3, 7, 15.",
                    "Continue 15 → 31 → 63."
                )
            }
        ]
    },

    entry_final: {
        title: "Wildcard Entry Final",
        timeLimitSeconds: 25 * 60,
        stages: [
            {
                id: "entry_final",
                title: "Entry Final Challenge",
                type: "short-answer",
                maxPoints: 100,
                speedMeasured: true,
                prompt: "A value is repeatedly replaced by the sum of its digits until one digit remains. What final digit is obtained from 987654? Enter one digit.",
                placeholder: "One digit",
                answers: ["3"],
                organizerAnswer: "3",
                hints: hints(
                    "Add all digits first.",
                    "9+8+7+6+5+4 = 39.",
                    "Then reduce 39 in the same way."
                )
            }
        ]
    },

    wildcard_final: {
        title: "Final Wildcard Match",
        timeLimitSeconds: 25 * 60,
        stages: [
            {
                id: "wildcard_final",
                title: "Final Wildcard Challenge",
                type: "short-answer",
                maxPoints: 100,
                speedMeasured: true,
                prompt: "For the sequence 1, 1, 2, 3, 5, 8, ... where each next term is the sum of the previous two, what is the 10th term? Enter only the number.",
                placeholder: "10th term",
                answers: ["55"],
                organizerAnswer: "55",
                hints: hints(
                    "Continue the sequence carefully without skipping positions.",
                    "Terms 7 and 8 are 13 and 21.",
                    "Terms 9 and 10 are 34 and 55."
                )
            }
        ]
    },

    final: {
        title: "Grand Final",
        timeLimitSeconds: 60 * 60,
        stages: [
            {
                id: "final",
                title: "Grand Final Challenge",
                type: "short-answer",
                maxPoints: 100,
                speedMeasured: true,
                prompt: "Take the decimal number 2026. Find the remainder when it is divided by 37, square that remainder, then add 10. Enter only the final number.",
                placeholder: "Final number",
                answers: ["794"],
                organizerAnswer: "794",
                hints: hints(
                    "First compute 2026 mod 37.",
                    "37 × 54 = 1998, so find the difference from 2026.",
                    "The remainder is 28; square it, then add 10."
                )
            }
        ]
    }
};
