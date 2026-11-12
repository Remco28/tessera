// Game rules. No rendering or input-device knowledge lives here: the engine
// is driven by press()/release()/update(dt) and read back by the renderer.

import { SHAPES, kicks, I, O, T, RUBBLE } from './pieces.ts';

export const W = 10;
export const H = 40;
export const VISIBLE = 20;
export const TOP = H - VISIBLE; // first visible row

export const LOCK_DELAY = 500;
export const MAX_LOCK_RESETS = 15;
export const SPRINT_LINES = 40;
export const ULTRA_MS = 120_000;

export type Action = 'left' | 'right' | 'soft' | 'hard' | 'cw' | 'ccw' | 'flip' | 'hold';
export type ModeId = 'marathon' | 'sprint' | 'ultra' | 'cleanup' | 'practice' | 'tutorial';

export interface Handling {
  /** Delay before a held direction starts repeating, ms. */
  das: number;
  /** Interval between repeats, ms. 0 = instant. */
  arr: number;
  /** Soft drop speed as a multiple of gravity. 0 = instant. */
  /** Soft drop speed in rows per second, the same at every level; 0 = instant. */
  softRate: number;
}

export interface GameOptions {
  mode: ModeId;
  handling: Handling;
  startLevel?: number;
  cleanupHeight?: number;
  /** Preset stack, bottom-aligned; any character other than '.' is a filled cell. */
  board?: string[];
  /** Fixed piece order. When it runs out no more pieces spawn. */
  sequence?: number[];
  allowHold?: boolean;
  rng?: () => number;
}

export interface Piece {
  type: number;
  rot: number;
  x: number;
  y: number;
}

export const SPIN_NONE = 0, SPIN_MINI = 1, SPIN_FULL = 2;

export interface LockEvent {
  type: number;
  rot: number;
  x: number;
  y: number;
  spin: number;
  lines: number;
}

const LINE_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD'];
const SCORE_PLAIN = [0, 100, 300, 500, 800];
const SCORE_MINI = [100, 200, 400];
const SCORE_SPIN = [400, 800, 1200, 1600];
const SCORE_PERFECT = [0, 800, 1200, 1800, 2000];

export function msPerRow(level: number): number {
  const l = Math.min(Math.max(level, 1), 20) - 1;
  return 1000 * Math.pow(0.8 - l * 0.007, l);
}

interface Snapshot {
  board: Uint8Array;
  queue: number[];
  bag: number[];
  type: number;
  hold: number;
  score: number;
  lines: number;
  combo: number;
  b2b: number;
  pieces: number;
  spins: number;
}

export class Game {
  readonly mode: ModeId;
  readonly handling: Handling;
  readonly board = new Uint8Array(W * H);
  active: Piece | null = null;
  hold = 0;
  holdUsed = false;
  queue: number[] = [];

  score = 0;
  lines = 0;
  level = 1;
  combo = -1;
  b2b = -1;
  pieces = 0;
  timeMs = 0;
  rubble = 0;
  /** T-spins of any kind, with or without a line clear. */
  spins = 0;

  over = false;
  won = false;
  /** True once a fixed sequence has been used up. */
  exhausted = false;

  /** Set whenever something visible changed; the renderer clears it. */
  dirty = true;
  popup: string[] = [];
  popupMs = 0;
  flashRows: number[] = [];
  flashMs = 0;

  onLock: ((e: LockEvent) => void) | null = null;

  private readonly startLevel: number;
  private readonly allowHold: boolean;
  private readonly finite: boolean;
  /** Practice: no gravity, no lock timer, undo, and topping out just wipes the board. */
  private readonly free: boolean;
  private history: Snapshot[] = [];
  private readonly rng: () => number;
  private bag: number[] = [];

  private held = { left: false, right: false, soft: false };
  private dir = 0;
  private dasMs = 0;
  private arrMs = 0;
  private gravity = 0;
  private lockMs = 0;
  private resets = 0;
  private lowest = 0;
  private lastRotate = false;
  private lastKick = 0;

  constructor(opts: GameOptions) {
    this.mode = opts.mode;
    this.handling = opts.handling;
    this.rng = opts.rng ?? Math.random;
    this.startLevel = opts.mode === 'marathon' ? Math.max(1, opts.startLevel ?? 1) : 1;
    this.level = this.startLevel;
    this.allowHold = opts.allowHold ?? true;
    this.free = opts.mode === 'practice';

    if (opts.board) {
      opts.board.forEach((row, i) => {
        const y = H - opts.board!.length + i;
        for (let x = 0; x < W; x++) if (row[x] && row[x] !== '.') this.board[y * W + x] = RUBBLE;
      });
    }
    if (opts.mode === 'cleanup') this.fillRubble(opts.cleanupHeight ?? 8);
    this.rubble = this.countRubble();

    this.finite = !!opts.sequence;
    if (opts.sequence) this.queue = opts.sequence.slice();
    this.refill();
    this.spawn();
  }

  // ---- queries -----------------------------------------------------------

  cell(x: number, y: number): number {
    return this.board[y * W + x];
  }

  fits(type: number, rot: number, px: number, py: number): boolean {
    const s = SHAPES[type][rot];
    for (let i = 0; i < 8; i += 2) {
      const x = px + s[i], y = py + s[i + 1];
      if (x < 0 || x >= W || y < 0 || y >= H || this.board[y * W + x]) return false;
    }
    return true;
  }

  ghostY(): number {
    const p = this.active!;
    let y = p.y;
    while (this.fits(p.type, p.rot, p.x, y + 1)) y++;
    return y;
  }

  grounded(): boolean {
    const p = this.active;
    return !!p && !this.fits(p.type, p.rot, p.x, p.y + 1);
  }

  // ---- input -------------------------------------------------------------

  press(a: Action): void {
    if (this.over) return;
    switch (a) {
      case 'left':
      case 'right': {
        this.held[a] = true;
        this.dir = a === 'left' ? -1 : 1;
        this.dasMs = 0;
        this.arrMs = 0;
        this.shift(this.dir);
        break;
      }
      case 'soft':
        // A tap always moves exactly one row; holding repeats at a steady rate.
        if (!this.held.soft && this.active && this.handling.softRate > 0) {
          this.gravity = 0;
          if (this.stepDown()) this.score += 1;
        }
        this.held.soft = true;
        break;
      case 'hard':
        this.hardDrop();
        break;
      case 'cw':
        this.rotate(1);
        break;
      case 'ccw':
        this.rotate(3);
        break;
      case 'flip':
        this.rotate(2);
        break;
      case 'hold':
        this.doHold();
        break;
    }
  }

  release(a: Action): void {
    if (a === 'soft') {
      this.held.soft = false;
    } else if (a === 'left' || a === 'right') {
      this.held[a] = false;
      const other = this.held.left ? -1 : this.held.right ? 1 : 0;
      if (other !== this.dir) {
        this.dir = other;
        this.dasMs = 0;
        this.arrMs = 0;
      }
    }
  }

  releaseAll(): void {
    this.held.left = this.held.right = this.held.soft = false;
    this.dir = 0;
  }

  // ---- simulation --------------------------------------------------------

  update(dt: number): void {
    if (this.over) return;
    this.timeMs += dt;

    if (this.popupMs > 0) {
      this.popupMs -= dt;
      if (this.popupMs <= 0) this.dirty = true;
    }
    if (this.flashMs > 0) {
      this.flashMs -= dt;
      this.dirty = true;
    }

    if (this.mode === 'ultra' && this.timeMs >= ULTRA_MS) {
      this.timeMs = ULTRA_MS;
      this.finish(true);
      return;
    }
    if (!this.active) return;

    if (this.dir) {
      const before = this.dasMs;
      this.dasMs += dt;
      if (this.dasMs >= this.handling.das) {
        this.arrMs += before >= this.handling.das ? dt : this.dasMs - this.handling.das;
        if (this.handling.arr <= 0) {
          while (this.shift(this.dir)) { /* slide to the wall */ }
          this.arrMs = 0;
        } else {
          while (this.arrMs >= this.handling.arr) {
            this.arrMs -= this.handling.arr;
            if (!this.shift(this.dir)) {
              this.arrMs = 0;
              break;
            }
          }
        }
      }
    }

    if (this.grounded()) {
      this.gravity = 0;
      if (this.free) return; // only a hard drop locks
      this.lockMs += dt;
      if (this.lockMs >= LOCK_DELAY || this.resets >= MAX_LOCK_RESETS) this.lock();
      return;
    }

    if (this.free && !this.held.soft) return;
    const fall = msPerRow(this.level);
    if (this.held.soft && this.handling.softRate <= 0) {
      this.gravity = H;
    } else if (this.held.soft) {
      // Fixed speed regardless of level, but never slower than gravity itself.
      this.gravity += dt / Math.min(fall, 1000 / this.handling.softRate);
    } else {
      this.gravity += dt / fall;
    }
    while (this.gravity >= 1 && this.stepDown()) {
      this.gravity -= 1;
      if (this.held.soft) this.score += 1;
    }
    if (this.grounded()) this.gravity = 0;
  }

  /** Practice only: take back the last placed piece. */
  undo(): boolean {
    const s = this.history.pop();
    if (!s) return false;
    this.board.set(s.board);
    this.queue = s.queue;
    this.bag = s.bag;
    this.hold = s.hold;
    this.score = s.score;
    this.lines = s.lines;
    this.combo = s.combo;
    this.b2b = s.b2b;
    this.pieces = s.pieces;
    this.spins = s.spins;
    this.holdUsed = false;
    this.popupMs = 0;
    this.flashMs = 0;
    this.spawn(s.type);
    return true;
  }

  // ---- internals ---------------------------------------------------------

  private refill(): void {
    if (this.finite) return;
    while (this.queue.length < 7) {
      if (!this.bag.length) {
        this.bag = [1, 2, 3, 4, 5, 6, 7];
        for (let i = 6; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop()!);
    }
  }

  private spawn(type?: number): void {
    if (type === undefined) {
      type = this.queue.shift();
      this.refill();
    }
    this.dirty = true;
    if (type === undefined) {
      this.active = null;
      this.exhausted = true;
      return;
    }
    const p: Piece = { type, rot: 0, x: type === O ? 4 : 3, y: TOP - 2 };
    if (!this.fits(p.type, p.rot, p.x, p.y)) {
      this.active = null;
      this.finish(false);
      return;
    }
    this.active = p;
    this.gravity = 0;
    this.lockMs = 0;
    this.resets = 0;
    this.lastRotate = false;
    if (this.fits(p.type, p.rot, p.x, p.y + 1)) p.y++;
    this.lowest = p.y;
  }

  private stepDown(): boolean {
    const p = this.active!;
    if (!this.fits(p.type, p.rot, p.x, p.y + 1)) return false;
    p.y++;
    this.lastRotate = false;
    this.lockMs = 0;
    if (p.y > this.lowest) {
      this.lowest = p.y;
      this.resets = 0;
    }
    this.dirty = true;
    return true;
  }

  private moved(wasGrounded: boolean): void {
    if (wasGrounded || this.grounded()) {
      this.resets++;
      this.lockMs = 0;
    }
    this.dirty = true;
  }

  private shift(dx: number): boolean {
    const p = this.active;
    if (!p || !this.fits(p.type, p.rot, p.x + dx, p.y)) return false;
    const g = this.grounded();
    p.x += dx;
    this.lastRotate = false;
    this.moved(g);
    return true;
  }

  private rotate(by: number): void {
    const p = this.active;
    if (!p) return;
    const to = (p.rot + by) % 4;
    const table = kicks(p.type, p.rot, to);
    for (let i = 0; i < table.length; i++) {
      const x = p.x + table[i][0], y = p.y - table[i][1];
      if (!this.fits(p.type, to, x, y)) continue;
      const g = this.grounded();
      p.rot = to;
      p.x = x;
      p.y = y;
      this.lastRotate = true;
      this.lastKick = i;
      if (p.y > this.lowest) {
        this.lowest = p.y;
        this.resets = 0;
      }
      this.moved(g);
      return;
    }
  }

  private hardDrop(): void {
    const p = this.active;
    if (!p) return;
    const y = this.ghostY();
    if (y > p.y) {
      this.score += 2 * (y - p.y);
      p.y = y;
      this.lastRotate = false;
    }
    this.lock();
  }

  private doHold(): void {
    const p = this.active;
    if (!p || this.holdUsed || !this.allowHold) return;
    const swap = this.hold;
    this.hold = p.type;
    this.spawn(swap || undefined);
    this.holdUsed = true;
  }

  private spinKind(p: Piece): number {
    if (p.type !== T || !this.lastRotate) return SPIN_NONE;
    const filled = (dx: number, dy: number): number => {
      const x = p.x + dx, y = p.y + dy;
      return x < 0 || x >= W || y >= H || this.board[y * W + x] ? 1 : 0;
    };
    const c = [filled(0, 0), filled(2, 0), filled(2, 2), filled(0, 2)]; // clockwise from top-left
    if (c[0] + c[1] + c[2] + c[3] < 3) return SPIN_NONE;
    // The two corners beside the T's pointing side decide full vs mini.
    const front = c[p.rot] + c[(p.rot + 1) % 4];
    return front === 2 || this.lastKick === 4 ? SPIN_FULL : SPIN_MINI;
  }

  private lock(): void {
    const p = this.active!;
    if (this.free) {
      this.history.push({
        board: this.board.slice(), queue: this.queue.slice(), bag: this.bag.slice(), type: p.type,
        hold: this.hold, score: this.score, lines: this.lines, combo: this.combo, b2b: this.b2b,
        pieces: this.pieces, spins: this.spins,
      });
      if (this.history.length > 200) this.history.shift();
    }
    const spin = this.spinKind(p);
    if (spin !== SPIN_NONE) this.spins++;
    const s = SHAPES[p.type][p.rot];
    let allHidden = true;
    for (let i = 0; i < 8; i += 2) {
      const y = p.y + s[i + 1];
      this.board[y * W + p.x + s[i]] = p.type;
      if (y >= TOP) allHidden = false;
    }

    const cleared: number[] = [];
    for (let y = 0; y < H; y++) {
      let full = true;
      for (let x = 0; x < W; x++) if (!this.board[y * W + x]) { full = false; break; }
      if (full) cleared.push(y);
    }
    for (const y of cleared) {
      this.board.copyWithin(W, 0, y * W);
      this.board.fill(0, 0, W);
    }
    const n = cleared.length;

    const text: string[] = [];
    let gain = 0;
    if (spin === SPIN_FULL) {
      gain = SCORE_SPIN[n];
      text.push('T-SPIN');
    } else if (spin === SPIN_MINI) {
      gain = SCORE_MINI[n];
      text.push('T-SPIN MINI');
    } else {
      gain = SCORE_PLAIN[n];
    }
    if (n) text.push(LINE_NAMES[n]);

    if (n) {
      const difficult = n === 4 || spin !== SPIN_NONE;
      if (difficult) {
        this.b2b++;
        if (this.b2b > 0) {
          gain = Math.floor(gain * 1.5);
          text.push('B2B X' + this.b2b);
        }
      } else {
        this.b2b = -1;
      }
      this.combo++;
      if (this.combo > 0) {
        gain += 50 * this.combo;
        text.push('COMBO ' + this.combo);
      }
      if (this.board.every((v) => v === 0)) {
        gain += n === 4 && this.b2b > 0 ? 3200 : SCORE_PERFECT[n];
        text.push('ALL CLEAR');
      }
      this.flashRows = cleared;
      this.flashMs = 140;
    } else {
      this.combo = -1;
    }

    this.score += gain * this.level;
    this.lines += n;
    this.pieces++;
    if (gain) text.push('+' + gain * this.level);
    if (text.length) {
      this.popup = text;
      this.popupMs = 1600;
    }
    if (this.mode === 'marathon') this.level = this.startLevel + Math.floor(this.lines / 10);
    if (n) this.rubble = this.countRubble();
    this.holdUsed = false;
    this.active = null;
    this.dirty = true;

    this.onLock?.({ type: p.type, rot: p.rot, x: p.x, y: p.y, spin, lines: n });

    if (this.mode === 'sprint' && this.lines >= SPRINT_LINES) return this.finish(true);
    if (this.mode === 'cleanup' && this.rubble === 0) return this.finish(true);
    if (allHidden && !n) return this.finish(false);
    this.spawn();
  }

  private finish(won: boolean): void {
    if (this.free) {
      this.board.fill(0);
      this.popup = ['TOPPED OUT', 'BOARD CLEARED'];
      this.popupMs = 1600;
      this.spawn();
      return;
    }
    this.over = true;
    this.won = won;
    this.dirty = true;
  }

  private countRubble(): number {
    let n = 0;
    for (let i = 0; i < this.board.length; i++) if (this.board[i] === RUBBLE) n++;
    return n;
  }

  private fillRubble(height: number): void {
    for (let y = H - height; y < H; y++) {
      let filled = 0;
      for (let x = 0; x < W; x++) {
        if (this.rng() < 0.6) {
          this.board[y * W + x] = RUBBLE;
          filled++;
        }
      }
      // Every row needs at least one block and at least one gap.
      if (filled === 0) this.board[y * W + Math.floor(this.rng() * W)] = RUBBLE;
      if (filled === W) this.board[y * W + Math.floor(this.rng() * W)] = 0;
    }
  }
}

export { I, O, T };
