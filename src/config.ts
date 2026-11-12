// Settings and best scores, stored as plain JSON under ~/.config/tessera.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Action, Handling } from './game/engine.ts';

export type BindAction = Action | 'pause' | 'retry' | 'undo';

export const BIND_ACTIONS: { id: BindAction; label: string }[] = [
  { id: 'left', label: 'MOVE LEFT' },
  { id: 'right', label: 'MOVE RIGHT' },
  { id: 'soft', label: 'SOFT DROP' },
  { id: 'hard', label: 'HARD DROP' },
  { id: 'cw', label: 'ROTATE CW' },
  { id: 'ccw', label: 'ROTATE CCW' },
  { id: 'flip', label: 'ROTATE 180' },
  { id: 'hold', label: 'HOLD' },
  { id: 'pause', label: 'PAUSE' },
  { id: 'retry', label: 'RETRY' },
  { id: 'undo', label: 'UNDO' },
];

export type Bindings = Record<BindAction, string[]>;

export interface Config {
  /** Keyboard bindings: key names as SDL reports them (e.g. "left", "space", "z"). */
  keys: Bindings;
  /** Gamepad bindings: a, b, x, y, dpadLeft, leftShoulder, start, stickLeft, leftTrigger ... */
  pad: Bindings;
  handling: Handling;
  ghost: boolean;
  pauseOnBlur: boolean;
  alwaysOnTop: boolean;
  startLevel: number;
  cleanupHeight: number;
  lesson: number;
  window: { width: number; height: number };
}

export function defaults(): Config {
  return {
    keys: {
      left: ['left'],
      right: ['right'],
      soft: ['down'],
      hard: ['space'],
      cw: ['up', 'x'],
      ccw: ['z'],
      flip: ['a'],
      hold: ['c', 'shift'],
      pause: ['escape', 'p'],
      retry: ['r'],
      undo: ['backspace'],
    },
    pad: {
      left: ['dpadLeft', 'stickLeft'],
      right: ['dpadRight', 'stickRight'],
      soft: ['dpadDown', 'stickDown'],
      hard: ['dpadUp'],
      cw: ['b'],
      ccw: ['a'],
      flip: ['y'],
      hold: ['leftShoulder', 'rightShoulder'],
      pause: ['start'],
      retry: ['back'],
      undo: ['x'],
    },
    handling: { das: 150, arr: 25, softRate: 20 },
    ghost: true,
    pauseOnBlur: true,
    alwaysOnTop: false,
    startLevel: 1,
    cleanupHeight: 8,
    lesson: 0,
    window: { width: 748, height: 714 },
  };
}

export interface Scores {
  marathon: number;
  ultra: number;
  /** Best time in ms; 0 = none yet. */
  sprint: number;
  /** Best time in ms per starting height. */
  cleanup: Record<string, number>;
}

const dir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'tessera');
export const CONFIG_PATH = join(dir, 'config.json');
const SCORES_PATH = join(dir, 'scores.json');

function readJson(path: string): Record<string, unknown> {
  try {
    const v = JSON.parse(readFileSync(path, 'utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeJson(path: string, value: unknown): void {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  } catch (e) {
    console.error(`tessera: could not write ${path}: ${(e as Error).message}`);
  }
}

/** Copy values from `src` over `base` wherever the types agree, one level deep per object. */
function merge<T extends object>(base: T, src: Record<string, unknown>): T {
  const out = base as Record<string, unknown>;
  for (const k of Object.keys(out)) {
    const b = out[k], s = src[k];
    if (s === undefined || s === null) continue;
    if (Array.isArray(b)) {
      if (Array.isArray(s)) out[k] = s.filter((v) => typeof v === 'string');
    } else if (typeof b === 'object' && b !== null) {
      if (typeof s === 'object' && !Array.isArray(s)) merge(b, s as Record<string, unknown>);
    } else if (typeof b === typeof s) {
      out[k] = s;
    }
  }
  return base;
}

export function loadConfig(): Config {
  return merge(defaults(), readJson(CONFIG_PATH));
}

export function saveConfig(c: Config): void {
  writeJson(CONFIG_PATH, c);
}

export function loadScores(): Scores {
  const s = merge({ marathon: 0, ultra: 0, sprint: 0 }, readJson(SCORES_PATH)) as Scores;
  const raw = readJson(SCORES_PATH).cleanup;
  s.cleanup = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number') s.cleanup[k] = v;
  }
  return s;
}

export function saveScores(s: Scores): void {
  writeJson(SCORES_PATH, s);
}
