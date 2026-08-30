/*
 * BYTEFEST 2026 - CODE SPRINT FINAL SELECTED QUESTION BANK (v8)
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
        prompt: `The wall shows four rows:\n\n2   3   -> 11\n4   5   -> 29\n6   7   -> 55\n8   9   -> ?\n\nEvery row uses the SAME rule.\n\n1) Find the missing value N.\n2) Write N in binary.\n3) Let P = number of 1-bits in N.\n4) Final key = N XOR (P << 4).\n\nEnter the final key.`,
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
        prompt: `START n = 14. Perform exactly 10 operations.\n\nCheck rules TOP-TO-BOTTOM and apply ONLY the first rule that matches:\n\n1. if n % 5 == 0: n = n/5 + 7\n2. else if n is even: n = n/2 + 4\n3. else: n = 2n - 3\n\nA = value after operation 3\nB = value after operation 6\nC = value after operation 10\n\nFinal key = (A + reverse(B)) XOR C.`,
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
        prompt: `Previous stages are LOCKED.\n\nLet:\nA = your Stage 1 final key\nB = your Stage 2 final key\n\n1) R = reverse(A)\n2) S = digitSum(B)\n3) T = R XOR B\n4) Final key = ((T << 1) + S) mod 100\n\nEnter the final key.\n\nImportant: the website does NOT show A or B again.`,
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
        prompt: `Four pixel rows are shown:\n\n1 0 1 0\n0 1 1 1\n1 1 0 0\n0 1 0 1\n\nTreat each row as a 4-bit binary number.\n\n1) Convert all four rows to decimal values.\n2) Sort the four values.\n3) Final = (largest - smallest) * (second-largest + second-smallest)\n4) Enter Final mod 100.`,
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
        prompt: `Initial state:\n\nSTACK bottom [6, 2, 9] top\nQUEUE front [4, 7, 3] rear\n\nExecute in order:\n\n1) a = POP()\n2) b = DEQUEUE()\n3) PUSH(a - b)\n4) ENQUEUE(a + b)\n5) c = POP()\n6) d = DEQUEUE()\n\nFinal key = (c * d) + current TOP(stack) + current FRONT(queue).`,
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
        prompt: `Inputs: A=1, B=1, C=0, D=1, E=0\n\nX = NAND(A,B)\nY = C XOR D\nZ = NOR(B,E)\nP = X OR Y\nQ = XNOR(D,E)\nR = P AND (NOT Z)\n\nTake bits in order Q-R-Y-X.\nRotate the 4-bit value RIGHT by 1.\nConvert the rotated value to decimal M.\n\nFinal key = M * 17 + 8.`,
        placeholder: "Power key",
        answers: ["59"],
        organizerAnswer: "59",
        hints: [hint("X=0, Y=1, Z=0.")],
        ui: {
          kind: "gates",
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
        prompt: `GRID:\nS . . # .\n# # . # .\n. . . . .\n. # # . #\n. . . . E\n\nStart facing EAST. Use the UNIQUE SHORTEST path to E.\n\nToken A = total number of F/L/R commands.\nAlso record F-count.\n\nPATTERN:\n(2,4)->10\n(3,5)->18\n(4,7)->32\n(6,9)->?\n\nToken B = pattern result XOR 21.\n\nFinal vault = (Token A * 5) + (Token B XOR F-count).`,
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
        prompt: `Input values:\n[5, 8, 12, 15, 21, 24]\n\nFor each x, test:\nA) divisible by 3\nB) even\nC) x > 10\n\nKEEP x only if EXACTLY TWO conditions are true.\n\nFor each kept x:\ntransform(x) = x^2 + 3x\n\nR = sum of transformed values\nToken = R mod 31\n\nThe panel shows 4 active switches.\n\nFinal key = Token * 4 + digitSum(R).`,
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
        prompt: `Edges (latency):\nS-A=4, S-B=5, S-C=3\nA-D=4, A-F=7\nB-D=2, B-F=4\nC-D=6, C-F=5\nD-T=5, F-T=3\n\nD is BLOCKED.\nSecure nodes are A and C.\n\nA valid route must:\n- pass through EXACTLY ONE secure node\n- have EVEN total latency\n\nChoose the minimum-latency valid route.\n\nchecksum = alphabet positions of non-S route nodes\nFinal key = (latency << 3) XOR checksum.`,
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
        prompt: `Matrix:\n\n2  7  4\n9  5  1\n6  3  8\n\n1) Rotate the matrix 90 degrees CLOCKWISE.\n2) Read the MAIN diagonal of the rotated matrix as a 3-digit number N.\n3) Final key = (N XOR 63) mod 100.`,
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
        prompt: `Five barcode rows:\n\n0101\n1001\n0011\n1110\n0110\n\nConvert each 4-bit row to decimal: V1..V5.\n\nP = sum values at PRIME positions 2,3,5\nN = sum values at NON-PRIME positions 1,4\nDelta = |P - N|\nS = sum all values\n\nFinal key = ((S XOR (Delta << 4)) * 5 + P) mod 100.`,
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
        prompt: `A: 101011 (binary), ACTIVE\nB: 31 (hex), ACTIVE\nC: 100 (octal), ACTIVE\nD: 53 (decimal), STANDBY\nE: 111111 (binary), ACTIVE\n\nToken1 = sum ACTIVE values satisfying EXACTLY ONE:\n- value is PRIME\n- value is a PERFECT SQUARE\n\nEnter Token1.`,
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
        prompt: `Use your Token1 from Phase 1.\n\nn = Token1 mod 100\nRepeat exactly 4 times:\n\nif n % 4 == 0: n = n/4 + 19\nelse if n is even: n = n/2 + 9\nelse: n = (2n + 5) mod 100\n\nToken2 = final n.\n\nEnter Token2.`,
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
        prompt: `Use Token2 = 99 and write it as 8-bit:\np q r s t u v w\n\nA = p XOR r\nB = q AND v\nC = NOT(s OR t)\nD = u XOR w\n\nRead bits in order B-D-A-C to form binary M.\n\nToken3 = M * 9 + digitProduct(Token2)\n\nEnter Token3.`,
        placeholder: "Token 3",
        answers: ["216"],
        organizerAnswer: "216",
        hints: [hint("99 in 8-bit binary is 01100011.")],
        ui: {
          kind: "gates",
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
        prompt: `Use your stored tokens:\nToken1 = 156\nToken2 = 99\nToken3 = 216\n\nX = (Token1 mod 256) XOR Token2 XOR (Token3 mod 256)\n\nFinal code = X + reverse(last two digits of Token1)\n\nEnter the final code.`,
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
