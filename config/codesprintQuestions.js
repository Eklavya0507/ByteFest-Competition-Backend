/*
 * BYTEFEST 2026 - CODE SPRINT FINAL SELECTED QUESTION BANK (v9 LOGICAL/VISUAL)
 * Correct answers stay server-side in this file.
 * Frontend receives only prompt/ui/hints through stagePublic().
 */
const HINT_PENALTY = 10;
const hint = (text) => ({ text, penalty: HINT_PENALTY });

module.exports = {
  round1: {
    title: "Round 1 - Escape League",
    timeLimitSeconds: 45 * 60,
    stages: [
      {
        id: "cs-r1-s1-visual-pattern",
        title: "Stage 1 - Visual Pattern Wall",
        type: "matrix-pattern",
        maxPoints: 30,
        speedMeasured: true,
        prompt: `A security wall has learned one hidden rule from these completed terminals:

2,3 -> 11     4,5 -> 29     6,7 -> 55

The last terminal shows 8,9 -> ?. Call that missing value N.

The lock then reads N as binary. Let P be the number of 1-bits in that binary signature.

ACCESS KEY = N XOR (P << 4)

What key opens the wall?`,
        placeholder: "Final key",
        answers: ["25"],
        organizerAnswer: "25",
        hints: [],
        ui: {
          kind: "matrix",
          matrix: [[2,3,11],[4,5,29],[6,7,55],[8,9,"?"]],
          badges: ["Pattern", "Binary", "Popcount", "XOR"]
        }
      },
      {
        id: "cs-r1-s2-priority-maze",
        title: "Stage 2 - Priority Rule Maze",
        type: "priority-maze",
        maxPoints: 30,
        speedMeasured: true,
        prompt: `A maze controller begins with n = 14. On every tick it scans these rules from TOP to BOTTOM and applies only the first rule that matches:

- divisible by 5  -> n/5 + 7
- otherwise even -> n/2 + 4
- otherwise      -> 2n - 3

After 10 ticks, three hidden sensors remember the values at tick 3 (A), tick 6 (B), and tick 10 (C).

The exit lock reads: (A + reverse(B)) XOR C

Find the exit code.`,
        placeholder: "Final maze key",
        answers: ["109"],
        organizerAnswer: "109",
        hints: [hint("After operation 3, n = 35.")],
        ui: {
          kind: "rules",
          start: "n = 14",
          rules: ["n % 5 == 0  -> n/5 + 7", "n even -> n/2 + 4", "otherwise -> 2n - 3"],
          checkpoints: ["A @ op 3", "B @ op 6", "C @ op 10"]
        }
      },
      {
        id: "cs-r1-s3-memory-hybrid",
        title: "Stage 3 - Memory Cipher Lock",
        type: "memory-lock",
        maxPoints: 40,
        speedMeasured: true,
        prompt: `The previous two rooms are now sealed; their answers are no longer visible.

Let A be the key you used in Stage 1 and B the key from Stage 2. The memory lock mirrors A, counts the digits of B, XORs the mirrored A with B, then doubles that result and adds the digit count. Only the last two digits matter.

What code does the lock accept?`,
        placeholder: "Memory key",
        answers: ["88"],
        organizerAnswer: "88",
        hints: [hint("Stage 1 + Stage 2 = 134.")],
        ui: {
          kind: "memory",
          slots: ["STAGE 1 KEY: ??", "STAGE 2 KEY: ??"],
          badges: ["REVERSE", "DIGIT SUM", "XOR", "SHIFT"]
        }
      }
    ]
  },

  round2: {
    title: "Round 2 - Systems League",
    timeLimitSeconds: 45 * 60,
    stages: [
      {
        id: "cs-r2-s1-pixel-checksum",
        title: "Stage 1 - Pixel Checksum Wall",
        type: "pixel-binary",
        maxPoints: 30,
        speedMeasured: true,
        prompt: `Four diagnostic strips are blinking as 4-bit values:

1010     0111     1100     0101

The controller converts the strips to decimal and arranges them from low to high. Its checksum is:

(largest - smallest) x (two middle values added together)

Only the last two decimal digits are accepted. What is the checksum?`,
        placeholder: "Pixel checksum",
        answers: ["19"],
        organizerAnswer: "19",
        hints: [],
        ui: {
          kind: "pixel-matrix",
          matrix: [[1,0,1,0],[0,1,1,1],[1,1,0,0],[0,1,0,1]],
          badges: ["4-BIT ROWS", "SORT", "CHECKSUM"]
        }
      },
      {
        id: "cs-r2-s2-stack-queue",
        title: "Stage 2 - Stack / Queue Machine",
        type: "stack-queue-simulation",
        maxPoints: 30,
        speedMeasured: true,
        prompt: `The machine starts with:
STACK bottom [6,2,9] top
QUEUE front [4,7,3] rear

Its recovery script fires this chain without pausing:
a=POP -> b=DEQUEUE -> PUSH(a-b) -> ENQUEUE(a+b) -> c=POP -> d=DEQUEUE

The unlock sensor reads (c x d) + the CURRENT stack top + the CURRENT queue front.

What value does it see?`,
        placeholder: "Machine key",
        answers: ["40"],
        organizerAnswer: "40",
        hints: [hint("After step 4, the new stack top is 5.")],
        ui: {
          kind: "stack-queue",
          stack: [6,2,9],
          queue: [4,7,3],
          operations: ["POP -> a", "DEQUEUE -> b", "PUSH(a-b)", "ENQUEUE(a+b)", "POP -> c", "DEQUEUE -> d"]
        }
      },
      {
        id: "cs-r2-s3-digital-grid",
        title: "Stage 3 - Digital Power Grid",
        type: "logic-gate-network",
        maxPoints: 40,
        speedMeasured: true,
        prompt: `A damaged power grid exposes five live inputs: A=1, B=1, C=0, D=1, E=0.

Rebuild the circuit using these gate labels:
X=NAND(A,B), Y=C XOR D, Z=NOR(B,E), P=X OR Y, Q=XNOR(D,E), R=P AND NOT Z.

When the circuit is stable, the controller reads Q-R-Y-X as a 4-bit word, rotates it one place to the RIGHT, converts it to decimal M, then applies:

POWER KEY = M x 17 + 8

Find the key.`,
        placeholder: "Power key",
        answers: ["59"],
        organizerAnswer: "59",
        hints: [hint("X=0, Y=1, Z=0.")],
        ui: {
          kind: "gates-connect",
          inputs: ["A=1","B=1","C=0","D=1","E=0"],
          gates: ["X=NAND(A,B)","Y=C XOR D","Z=NOR(B,E)","P=X OR Y","Q=XNOR(D,E)","R=P AND NOT Z"],
          outputOrder: "Q - R - Y - X"
        }
      }
    ]
  },

  qualifier: {
    title: "Qualifier - Robot Recovery Lab",
    timeLimitSeconds: 45 * 60,
    stages: [
      {
        id: "cs-qualifier-robot-vault",
        title: "Qualifier - Robot Recovery Lab",
        type: "robot-pattern-vault",
        maxPoints: 100,
        speedMeasured: true,
        prompt: `A recovery robot starts at S facing EAST. Walls are # and the only exit is E:

S..#.
##.#.
.....
.##.#
....E

Use the unique shortest route. Token A is the total number of F/L/R commands; also remember how many of those commands are F.

A second panel shows: (2,4)->10, (3,5)->18, (4,7)->32, (6,9)->?. Its missing value XOR 21 becomes Token B.

MASTER VAULT = (Token A x 5) + (Token B XOR F-count).`,
        placeholder: "Master vault key",
        answers: ["93"],
        organizerAnswer: "93",
        hints: [hint("Pattern rule is a * (b + 1).")],
        ui: {
          kind: "robot-grid",
          grid: ["S..#.","##.#.",".....",".##.#","....E"],
          startFacing: "EAST",
          commands: ["F","L","R"],
          pattern: ["(2,4) -> 10","(3,5) -> 18","(4,7) -> 32","(6,9) -> ?"]
        }
      }
    ]
  },

  semifinal: {
    title: "Semifinal - Triple Condition Filter",
    timeLimitSeconds: 35 * 60,
    stages: [
      {
        id: "cs-semifinal-triple-filter",
        title: "Semifinal - Triple-Condition Filter",
        type: "condition-filter",
        maxPoints: 100,
        speedMeasured: true,
        prompt: `Six data packets arrive: [5,8,12,15,21,24].

A packet survives only when EXACTLY TWO of these lights turn on: divisible by 3, even, greater than 10. Every survivor is transformed by x^2 + 3x and the transformed values are summed into R.

Token = R mod 31. The control panel has 4 active switches.

CONTROL KEY = Token x 4 + digitSum(R).`,
        placeholder: "Control key",
        answers: ["138"],
        organizerAnswer: "138",
        hints: [hint("15 and 21 survive the filter.")],
        ui: {
          kind: "filter-cards",
          values: [5,8,12,15,21,24],
          conditions: ["divisible by 3","even","x > 10"],
          rule: "KEEP EXACTLY TWO TRUE"
        }
      }
    ]
  },

  wildcard: {
    title: "Wildcard Entry - Secure Route",
    timeLimitSeconds: 35 * 60,
    stages: [
      {
        id: "cs-wildcard-secure-route",
        title: "Wildcard Entry - Secure Route Map",
        type: "network-route",
        maxPoints: 100,
        speedMeasured: true,
        prompt: `A network must reach T from S. D is blocked. A and C are secure nodes.

Latencies: S-A4, S-B5, S-C3, A-D4, A-F7, B-D2, B-F4, C-D6, C-F5, D-T5, F-T3.

A route is valid only if it touches EXACTLY ONE secure node and its total latency is EVEN. Among valid routes, choose the fastest.

Checksum = alphabet positions of every non-S node on that route.
NETWORK KEY = (latency << 3) XOR checksum.`,
        placeholder: "Network key",
        answers: ["107"],
        organizerAnswer: "107",
        hints: [hint("Remove every route through D first.")],
        ui: {
          kind: "network",
          nodes: ["S","A","B","C","D BLOCKED","F","T"],
          edges: ["S-A 4","S-B 5","S-C 3","A-D 4","A-F 7","B-D 2","B-F 4","C-D 6","C-F 5","D-T 5","F-T 3"],
          secure: ["A","C"]
        }
      }
    ]
  },

  entry_final: {
    title: "Wildcard Entry Final - Matrix Rotation",
    timeLimitSeconds: 25 * 60,
    stages: [
      {
        id: "cs-entry-final-matrix",
        title: "Entry Final - Matrix Rotation Lock",
        type: "matrix-rotation",
        maxPoints: 100,
        speedMeasured: true,
        prompt: `The lock shows this matrix:

2  7  4
9  5  1
6  3  8

The display is physically rotated 90 degrees CLOCKWISE. Read the main diagonal after rotation as one 3-digit number N.

MATRIX KEY = (N XOR 63) mod 100.`,
        placeholder: "Matrix key",
        answers: ["89"],
        organizerAnswer: "89",
        hints: [hint("After rotation, the top row is 6, 9, 2.")],
        ui: {
          kind: "matrix-rotation",
          matrix: [[2,7,4],[9,5,1],[6,3,8]],
          rotation: "90° CLOCKWISE"
        }
      }
    ]
  },

  wildcard_final: {
    title: "Final Wildcard - Binary Barcode",
    timeLimitSeconds: 25 * 60,
    stages: [
      {
        id: "cs-final-wildcard-barcode",
        title: "Final Wildcard - Binary Barcode Lock",
        type: "barcode-binary",
        maxPoints: 100,
        speedMeasured: true,
        prompt: `Five binary barcode strips scan as:
0101   1001   0011   1110   0110

Convert them to decimal values V1..V5. Let P be the sum at prime positions 2,3,5 and N the sum at non-prime positions 1,4. Let Delta=|P-N| and S be the sum of all five values.

BARCODE KEY = ((S XOR (Delta << 4)) x 5 + P) mod 100.`,
        placeholder: "Barcode key",
        answers: ["83"],
        organizerAnswer: "83",
        hints: [hint("The five values are 5, 9, 3, 14, 6.")],
        ui: {
          kind: "barcode",
          rows: ["0101","1001","0011","1110","0110"],
          primePositions: [2,3,5]
        }
      }
    ]
  },

  final: {
    title: "Grand Final - Four Phase Memory Vault",
    timeLimitSeconds: 60 * 60,
    stages: [
      {
        id: "cs-grand-p1-sensors",
        title: "Grand Final Phase 1 - Sensor Filter",
        type: "sensor-filter",
        maxPoints: 25,
        speedMeasured: true,
        prompt: `Five sensors report: A=101011(binary) ACTIVE, B=31(hex) ACTIVE, C=100(octal) ACTIVE, D=53(decimal) STANDBY, E=111111(binary) ACTIVE.

The vault accepts only ACTIVE sensors satisfying EXACTLY ONE property: PRIME or PERFECT SQUARE. Add every accepted sensor value.

That sum is Token1.`,
        placeholder: "Token 1",
        answers: ["156"],
        organizerAnswer: "156",
        hints: [],
        ui: {
          kind: "sensor-cards",
          cards: ["A 101011 BIN ACTIVE","B 31 HEX ACTIVE","C 100 OCT ACTIVE","D 53 DEC STANDBY","E 111111 BIN ACTIVE"]
        }
      },
      {
        id: "cs-grand-p2-recurrence",
        title: "Grand Final Phase 2 - Priority Recurrence",
        type: "recurrence",
        maxPoints: 25,
        speedMeasured: true,
        prompt: `The second vault inherits Token1 but immediately keeps only Token1 mod 100 as n. Four controller cycles follow. On each cycle the first matching rule wins:

- n divisible by 4 -> n/4 + 19
- otherwise n even -> n/2 + 9
- otherwise -> (2n + 5) mod 100

After the fourth cycle, the displayed n is Token2.`,
        placeholder: "Token 2",
        answers: ["99"],
        organizerAnswer: "99",
        hints: [hint("Phase 2 starts with 56.")],
        ui: {
          kind: "rules",
          start: "n = Token1 mod 100",
          rules: ["n % 4 == 0 -> n/4+19","even -> n/2+9","otherwise -> (2n+5)%100"]
        }
      },
      {
        id: "cs-grand-p3-bits",
        title: "Grand Final Phase 3 - Bit Extraction",
        type: "bit-network",
        maxPoints: 25,
        speedMeasured: true,
        prompt: `Token2 is 99. The bit console expands it to 8 bits p q r s t u v w. Build the small circuit:
A=p XOR r, B=q AND v, C=NOT(s OR t), D=u XOR w.

The console reads the outputs in the unusual order B-D-A-C to form binary M.

Token3 = M x 9 + digitProduct(Token2).`,
        placeholder: "Token 3",
        answers: ["216"],
        organizerAnswer: "216",
        hints: [hint("99 in 8-bit binary is 01100011.")],
        ui: {
          kind: "gates-connect",
          inputs: ["Token2 = 99", "8-bit = 01100011"],
          gates: ["A=p XOR r","B=q AND v","C=NOT(s OR t)","D=u XOR w"],
          outputOrder: "B - D - A - C"
        }
      },
      {
        id: "cs-grand-p4-vault",
        title: "Grand Final Phase 4 - Final Vault",
        type: "memory-vault",
        maxPoints: 25,
        speedMeasured: true,
        prompt: `The final vault remembers Token1=156, Token2=99 and Token3=216.

Its hidden register computes X=(Token1 mod 256) XOR Token2 XOR (Token3 mod 256). The door then adds the reverse of the last two digits of Token1.

What final code appears?`,
        placeholder: "Grand Final code",
        answers: ["104"],
        organizerAnswer: "104",
        hints: [],
        ui: {
          kind: "memory",
          slots: ["TOKEN 1: 156", "TOKEN 2: 99", "TOKEN 3: 216"],
          badges: ["MOD 256", "XOR", "REVERSE", "FINAL"]
        }
      }
    ]
  }
};
