// T-spin school: preset boards with a fixed piece order and a goal.

import { Game, SPIN_FULL, SPIN_MINI } from './engine.ts';
import type { Handling, LockEvent } from './engine.ts';
import { I, J, L, S, T, Z, SHAPES } from './pieces.ts';

export interface Target {
  x: number;
  y: number;
  rot: number;
}

export interface Lesson {
  title: string;
  intro: string;
  steps: string[];
  board: string[];
  sequence: number[];
  /** Where each piece of the sequence should end up (absolute board position). */
  targets: Target[];
  goal: { spin: number; lines: number };
}

export const LESSONS: Lesson[] = [
  {
    title: 'T-SPIN DOUBLE',
    intro: 'A T-SPIN IS A T PIECE THAT IS ROTATED INTO A TIGHT SLOT AS ITS VERY LAST MOVE. THE SLOT HERE IS READY TO USE.',
    steps: [
      'ROTATE THE T SO IT POINTS RIGHT.',
      'SOFT DROP IT INTO THE GAP. DO NOT HARD DROP YET.',
      'ROTATE CLOCKWISE. IT TWISTS UNDER THE OVERHANG.',
    ],
    board: [
      'XXXX......',
      'XXX...XXXX',
      'XXXX.XXXXX',
    ],
    sequence: [T],
    targets: [{ x: 3, y: 37, rot: 2 }],
    goal: { spin: SPIN_FULL, lines: 2 },
  },
  {
    title: 'T-SPIN SINGLE',
    intro: 'THE SAME TWIST, BUT ONLY ONE ROW IS READY TO CLEAR. IT STILL SCORES MORE THAN A PLAIN TRIPLE.',
    steps: [
      'POINT THE T RIGHT AND SOFT DROP INTO THE GAP.',
      'ROTATE CLOCKWISE TO FINISH.',
    ],
    board: [
      'XXXX......',
      'XXX...XXX.',
      'XXXX.XXXXX',
    ],
    sequence: [T],
    targets: [{ x: 3, y: 37, rot: 2 }],
    goal: { spin: SPIN_FULL, lines: 1 },
  },
  {
    title: 'BUILD THE OVERHANG',
    intro: 'A SLOT NEEDS A ROOF OVER ONE SIDE. HERE THE ROOF IS MISSING, SO BUILD IT FIRST.',
    steps: [
      'PLACE THE Z FLAT SO ITS LOWER HALF HANGS OVER THE LEFT OF THE HOLE.',
      'DROP THE T IN POINTING RIGHT.',
      'ROTATE CLOCKWISE.',
    ],
    board: [
      'XX........',
      'XXX...XXXX',
      'XXXX.XXXXX',
    ],
    sequence: [Z, T],
    targets: [{ x: 1, y: 36, rot: 0 }, { x: 3, y: 37, rot: 2 }],
    goal: { spin: SPIN_FULL, lines: 2 },
  },
  {
    title: 'OVERHANG FROM THE RIGHT',
    intro: 'THE ROOF CAN SIT ON EITHER SIDE. THIS TIME IT GOES ON THE RIGHT, SO THE T ENTERS FROM THE LEFT.',
    steps: [
      'LAY THE L FLAT SO ITS LEFT END HANGS OVER THE HOLE.',
      'DROP THE T IN POINTING LEFT.',
      'ROTATE COUNTER-CLOCKWISE.',
    ],
    board: [
      '........XX',
      'XXX...XXXX',
      'XXXX.XXXXX',
    ],
    sequence: [L, T],
    targets: [{ x: 5, y: 36, rot: 0 }, { x: 3, y: 37, rot: 2 }],
    goal: { spin: SPIN_FULL, lines: 2 },
  },
  {
    title: 'T-SPIN TRIPLE',
    intro: 'THE T CAN KICK DOWN TWO ROWS INTO A DEEP NOTCH. THREE ROWS AT ONCE.',
    steps: [
      'KEEP THE T FLAT, POINTING UP. DROP IT ON THE LEDGE TO THE RIGHT OF THE ROOF.',
      'SLIDE IT LEFT UNDER THE ROOF AS FAR AS IT GOES.',
      'ROTATE CLOCKWISE. IT DROPS INTO THE NOTCH.',
    ],
    board: [
      'XX........',
      'X.........',
      'X.XXXXXXXX',
      'X..XXXXXXX',
      'X.XXXXXXXX',
    ],
    sequence: [T],
    targets: [{ x: 0, y: 37, rot: 1 }],
    goal: { spin: SPIN_FULL, lines: 3 },
  },
  {
    title: 'T-SPIN MINI',
    intro: 'A TWIST WHERE THE CORNERS BESIDE THE POINT ARE NOT BOTH FILLED IS A MINI. SMALLER BONUS, BUT IT KEEPS A BACK-TO-BACK CHAIN ALIVE.',
    steps: [
      'KEEP THE T FLAT, POINTING UP. PLACE IT AGAINST THE LEFT WALL WITHOUT HARD DROPPING.',
      'ROTATE CLOCKWISE. IT KICKS INTO THE WALL COLUMN.',
    ],
    board: [
      '...XXXXXXX',
      '.XXXXXXXXX',
    ],
    sequence: [T],
    targets: [{ x: -1, y: 37, rot: 1 }],
    goal: { spin: SPIN_MINI, lines: 1 },
  },
  {
    title: 'SETUP: HOOK ROOF',
    intro: 'NOW THE SETUPS. LEAVE A ONE-WIDE WELL NEXT TO THE SLOT, THEN DROP A J OR L INTO IT. ITS HOOK BECOMES THE ROOF.',
    steps: [
      'STAND THE J UPRIGHT WITH ITS HOOK POINTING RIGHT AND DROP IT INTO THE WELL.',
      'DROP THE T IN POINTING RIGHT, THEN ROTATE CLOCKWISE.',
    ],
    board: [
      'XX....XXXX',
      'XX.X.XXXXX',
    ],
    sequence: [J, T],
    targets: [{ x: 1, y: 37, rot: 1 }, { x: 3, y: 37, rot: 2 }],
    goal: { spin: SPIN_FULL, lines: 2 },
  },
  {
    title: 'SETUP: FROM FLAT GROUND',
    intro: 'BUILD THE WHOLE SLOT YOURSELF. THE RULE: LEAVE ONE GAP ON THE BOTTOM ROW, A THREE-WIDE GAP ABOVE IT, THEN ROOF ONE SIDE.',
    steps: [
      'LAY THE I FLAT IN THE LEFT CORNER. THAT LEAVES THE ONE GAP.',
      'LAY THE J FLAT ON TOP OF IT, AGAINST THE WALL.',
      'HANG THE Z OVER THE EDGE AS THE ROOF.',
      'T IN POINTING RIGHT, ROTATE CLOCKWISE.',
    ],
    board: [
      '......XXXX',
      '.....XXXXX',
    ],
    sequence: [I, J, Z, T],
    targets: [{ x: 0, y: 38, rot: 0 }, { x: 0, y: 37, rot: 0 }, { x: 1, y: 36, rot: 0 }, { x: 3, y: 37, rot: 2 }],
    goal: { spin: SPIN_FULL, lines: 2 },
  },
  {
    title: 'SETUP: MIRRORED',
    intro: 'THE SAME IDEA ON THE OTHER SIDE WITH THE MIRROR PIECES. USE WHICHEVER SIDE YOUR NEXT PIECES SUIT.',
    steps: [
      'LAY THE I FLAT IN THE RIGHT CORNER.',
      'LAY THE L FLAT ON TOP OF IT, AGAINST THE WALL.',
      'HANG THE S OVER THE EDGE AS THE ROOF.',
      'T IN POINTING LEFT, ROTATE COUNTER-CLOCKWISE.',
    ],
    board: [
      'XXXX......',
      'XXXXX.....',
    ],
    sequence: [I, L, S, T],
    targets: [{ x: 6, y: 38, rot: 0 }, { x: 7, y: 37, rot: 0 }, { x: 6, y: 36, rot: 0 }, { x: 4, y: 37, rot: 2 }],
    goal: { spin: SPIN_FULL, lines: 2 },
  },
];

export type TutorialState = 'play' | 'done' | 'failed';

export class Tutorial {
  index = 0;
  game!: Game;
  state: TutorialState = 'play';
  /** Why the lesson failed: an earlier piece was misplaced, or the final T was not the right spin. */
  failedOn: 'placement' | 'spin' = 'spin';
  private readonly handling: Handling;
  private placed = 0;

  constructor(handling: Handling, index = 0) {
    this.handling = handling;
    this.start(index);
  }

  get lesson(): Lesson {
    return LESSONS[this.index];
  }

  /** Target for the piece currently in play, if any. */
  get target(): Target | null {
    return this.state === 'play' ? (this.lesson.targets[this.placed] ?? null) : null;
  }

  start(index: number): void {
    this.index = ((index % LESSONS.length) + LESSONS.length) % LESSONS.length;
    const l = this.lesson;
    this.state = 'play';
    this.placed = 0;
    this.game = new Game({
      mode: 'tutorial',
      handling: this.handling,
      board: l.board,
      sequence: l.sequence,
      allowHold: false,
    });
    this.game.onLock = (e) => this.locked(e);
  }

  restart(): void {
    this.start(this.index);
  }

  private locked(e: LockEvent): void {
    this.placed++;
    const { goal, sequence } = this.lesson;
    if (e.spin === goal.spin && e.lines === goal.lines) this.state = 'done';
    else if (this.placed >= sequence.length) {
      this.state = 'failed';
      this.failedOn = 'spin';
    }
    else {
      // An earlier piece in the wrong place makes the lesson unwinnable.
      const t = this.lesson.targets[this.placed - 1];
      if (t && cellsKey(e.type, t) !== cellsKey(e.type, e)) {
        this.state = 'failed';
        this.failedOn = 'placement';
      }
    }
    this.game.dirty = true;
  }
}

/** Occupied cells as a comparable string, so equivalent rotations match. */
function cellsKey(type: number, p: Target): string {
  const s = SHAPES[type][p.rot];
  const out: number[] = [];
  for (let i = 0; i < 8; i += 2) out.push((p.y + s[i + 1]) * 100 + p.x + s[i]);
  return out.sort((a, b) => a - b).join(',');
}
