// Screen drawing. Everything here draws into a Surface and knows nothing
// about windows or input devices.

import { Surface, rgb, mix, wrap, CHAR_W, CHAR_H } from './gfx.ts';
import { Game, W, VISIBLE, TOP, SPRINT_LINES, ULTRA_MS } from '../game/engine.ts';
import { SHAPES } from '../game/pieces.ts';
import { LESSONS } from '../game/tutorial.ts';
import type { Tutorial, Target } from '../game/tutorial.ts';

const C = {
  bg: rgb(0x15171c),
  well: rgb(0x0c0e12),
  slot: rgb(0x181b22),
  panel: rgb(0x1b1e26),
  text: rgb(0xe8e6e1),
  dim: rgb(0x7a828e),
  faint: rgb(0x3a404b),
  hint: rgb(0x5d6573),
  accent: rgb(0xc394ff),
  card: rgb(0x191c24),
  select: rgb(0x242836),
  key: rgb(0x262a36),
  keyOn: rgb(0x343a4d),
  keyEdge: rgb(0x0e1014),
  good: rgb(0x6bcb4f),
  bad: rgb(0xef476f),
  white: rgb(0xffffff),
  black: rgb(0x000000),
};

// Index 0 unused; 1..7 pieces in I J L O S T Z order; 8 rubble.
const BASE = [0, 0x2ec4b6, 0x3a86ff, 0xff8c42, 0xf4c430, 0x6bcb4f, 0x9b5de5, 0xef476f, 0x626a78].map(rgb);
const LIGHT = BASE.map((c) => mix(c, C.white, 0.35));
const DARK = BASE.map((c) => mix(c, C.black, 0.35));
const GHOST = BASE.map((c) => mix(c, C.well, 0.45));

export function formatTime(ms: number, digits = 1): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor(t / 1000) % 60;
  if (digits === 0) return `${m}:${String(s).padStart(2, '0')}`;
  const frac = digits === 2 ? Math.floor(t / 10) % 100 : Math.floor(t / 100) % 10;
  return `${m}:${String(s).padStart(2, '0')}.${String(frac).padStart(digits, '0')}`;
}

function tile(s: Surface, x: number, y: number, size: number, type: number): void {
  const g = size >= 10 ? 1 : 0; // grout
  const n = size - g;
  const b = Math.max(1, Math.round(size / 9));
  s.rect(x, y, n, n, BASE[type]);
  if (n < 5) return;
  s.rect(x, y, n, b, LIGHT[type]);
  s.rect(x, y, b, n, LIGHT[type]);
  s.rect(x, y + n - b, n, b, DARK[type]);
  s.rect(x + n - b, y, b, n, DARK[type]);
}

function outline(s: Surface, x: number, y: number, size: number, c: number): void {
  const g = size >= 10 ? 1 : 0;
  s.frame(x, y, size - g, size - g, Math.max(1, Math.round(size / 9)), c);
}

function board(s: Surface, game: Game, bx: number, by: number, cell: number, ghost: boolean, target: Target | null): void {
  s.rect(bx - 2, by - 2, W * cell + 3, VISIBLE * cell + 3, C.faint);
  s.rect(bx - 1, by - 1, W * cell + 1, VISIBLE * cell + 1, C.well);
  const g = cell >= 10 ? 1 : 0;
  for (let y = 0; y < VISIBLE; y++) {
    for (let x = 0; x < W; x++) {
      const v = game.cell(x, y + TOP);
      if (v) tile(s, bx + x * cell, by + y * cell, cell, v);
      else s.rect(bx + x * cell, by + y * cell, cell - g, cell - g, C.slot);
    }
  }

  const p = game.active;
  if (target && p) {
    const sh = SHAPES[p.type][target.rot];
    for (let i = 0; i < 8; i += 2) {
      const x = bx + (target.x + sh[i]) * cell, y = by + (target.y + sh[i + 1] - TOP) * cell;
      s.shade(x, y, cell - g, cell - g, C.white, 0.14);
      outline(s, x, y, cell, C.text);
    }
  }
  if (p) {
    const sh = SHAPES[p.type][p.rot];
    if (ghost) {
      const gy = game.ghostY();
      for (let i = 0; i < 8; i += 2) {
        const yy = gy + sh[i + 1] - TOP;
        if (yy >= 0) outline(s, bx + (p.x + sh[i]) * cell, by + yy * cell, cell, GHOST[p.type]);
      }
    }
    for (let i = 0; i < 8; i += 2) {
      const yy = p.y + sh[i + 1] - TOP;
      if (yy >= 0) tile(s, bx + (p.x + sh[i]) * cell, by + yy * cell, cell, p.type);
    }
  }

  if (game.flashMs > 0) {
    const a = Math.min(1, game.flashMs / 140) * 0.7;
    for (const row of game.flashRows) {
      if (row >= TOP) s.shade(bx, by + (row - TOP) * cell, W * cell - g, cell - g, C.white, a);
    }
  }
}

/** Draw a piece centred in the given box. */
function preview(s: Surface, type: number, x: number, y: number, w: number, h: number, size: number): void {
  if (!type) return;
  const sh = SHAPES[type][0];
  let minX = 9, maxX = 0, minY = 9, maxY = 0;
  for (let i = 0; i < 8; i += 2) {
    minX = Math.min(minX, sh[i]);
    maxX = Math.max(maxX, sh[i]);
    minY = Math.min(minY, sh[i + 1]);
    maxY = Math.max(maxY, sh[i + 1]);
  }
  const ox = Math.round(x + (w - (maxX - minX + 1) * size) / 2) - minX * size;
  const oy = Math.round(y + (h - (maxY - minY + 1) * size) / 2) - minY * size;
  for (let i = 0; i < 8; i += 2) tile(s, ox + sh[i] * size, oy + sh[i + 1] * size, size, type);
}

function panel(s: Surface, x: number, y: number, w: number, h: number): void {
  s.rect(x, y, w, h, C.panel);
}

/** Largest text scale up to `fs` at which every line fits in `width`. */
function fit(lines: string[], width: number, fs: number): number {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return Math.max(1, Math.min(fs, Math.floor(width / (longest * CHAR_W))));
}

function popup(s: Surface, game: Game, cx: number, y: number, width: number, fs: number): void {
  if (game.popupMs <= 0) return;
  fs = fit(game.popup, width, fs);
  game.popup.forEach((line, i) => {
    s.text(line, cx, y + i * (CHAR_H + 3) * fs, fs, i === 0 ? C.accent : C.text, 0);
  });
}

export interface GameView {
  game: Game;
  ghost: boolean;
  best: string;
  /** Small reminder lines shown at the bottom of the left column. */
  hint?: string[];
}

export function drawGame(s: Surface, v: GameView): void {
  const { game } = v;
  s.clear(C.bg);
  const cell = Math.max(4, Math.floor(Math.min(s.w / 22, s.h / 21)));
  const fs = Math.max(1, Math.round(cell / 13));
  const ox = Math.floor((s.w - 22 * cell) / 2);
  const oy = Math.floor((s.h - VISIBLE * cell) / 2);
  const lx = ox + Math.floor(cell / 2), pw = 5 * cell;
  const bx = ox + 6 * cell;
  const rx = ox + 16 * cell + Math.floor(cell / 2);
  const labelH = (CHAR_H + 4) * fs;

  board(s, game, bx, oy, cell, v.ghost, null);

  // Hold
  s.text('HOLD', lx, oy, fs, C.dim);
  panel(s, lx, oy + labelH, pw, 3 * cell);
  preview(s, game.hold, lx, oy + labelH, pw, 3 * cell, Math.floor(cell * 0.8));
  if (game.holdUsed) s.shade(lx, oy + labelH, pw, 3 * cell, C.panel, 0.6);

  // Next
  s.text('NEXT', rx, oy, fs, C.dim);
  const slot = Math.floor(cell * 2.8);
  panel(s, rx, oy + labelH, pw, slot * 5);
  for (let i = 0; i < 5; i++) {
    preview(s, game.queue[i] ?? 0, rx, oy + labelH + i * slot, pw, slot, Math.floor(cell * 0.8));
  }

  // Stats
  const stats: [string, string][] = [];
  const time = formatTime(game.timeMs, game.mode === 'marathon' ? 0 : 1);
  if (game.mode === 'marathon') {
    stats.push(['SCORE', String(game.score)], ['LEVEL', String(game.level)], ['LINES', String(game.lines)], ['TIME', time]);
  } else if (game.mode === 'sprint') {
    stats.push(['TIME', time], ['LINES', `${Math.min(game.lines, SPRINT_LINES)}/${SPRINT_LINES}`], ['PIECES', String(game.pieces)]);
  } else if (game.mode === 'ultra') {
    stats.push(['TIME LEFT', formatTime(ULTRA_MS - game.timeMs)], ['SCORE', String(game.score)], ['LINES', String(game.lines)]);
  } else if (game.mode === 'practice') {
    stats.push(['T-SPINS', String(game.spins)], ['LINES', String(game.lines)], ['PIECES', String(game.pieces)]);
  } else {
    stats.push(['TIME', time], ['RUBBLE', String(game.rubble)], ['LINES', String(game.lines)]);
  }
  const vs = 7 * CHAR_W * (fs + 1) <= pw ? fs + 1 : fs;
  const statH = labelH + (CHAR_H + 6) * vs;
  let y = oy + labelH + 3 * cell + cell;
  for (const [label, value] of stats) {
    s.text(label, lx, y, fs, C.dim);
    s.text(value, lx, y + labelH, vs, C.text);
    y += statH;
  }
  popup(s, game, lx + pw / 2, y + fs * 4, pw, fs);

  const hs = fit(v.hint ?? [], pw, fs);
  (v.hint ?? []).forEach((line, i, all) => {
    s.text(line, lx, oy + VISIBLE * cell - (all.length - i) * (CHAR_H + 4) * hs + 4 * hs, hs, C.hint);
  });

  if (v.best) {
    const by = oy + VISIBLE * cell - labelH - CHAR_H * fs;
    s.text('BEST', lx, by, fs, C.dim);
    s.text(v.best, lx, by + labelH, fs, C.dim);
  }
}

export interface TutorialView {
  tutorial: Tutorial;
  ghost: boolean;
  /** Key names to show in prompts. */
  retryKey: string;
  nextKey: string;
}

export function drawTutorial(s: Surface, v: TutorialView): void {
  const t = v.tutorial, game = t.game, lesson = t.lesson;
  s.clear(C.bg);
  const cell = Math.max(4, Math.floor(Math.min(s.w / 22, s.h / 21)));
  const ox = Math.floor((s.w - 22 * cell) / 2);
  const oy = Math.floor((s.h - VISIBLE * cell) / 2);
  const bx = ox + Math.floor(cell / 2);
  const tx = ox + 11 * cell + Math.floor(cell / 2);
  const tw = 10 * cell;
  board(s, game, bx, oy, cell, v.ghost, t.target);

  // Pick the largest text size at which the whole lesson fits above the
  // block pinned to the bottom of the column.
  const bottom = oy + VISIBLE * cell;
  const showNext = t.state === 'play' && game.queue.length > 0;
  const nextCell = Math.floor(cell * 0.6);
  const reserve = showNext ? 3 * nextCell + cell : cell;
  let ts = Math.max(1, Math.round(cell / 13));
  let chars = 0, title: string[] = [], intro: string[] = [], steps: string[][] = [];
  for (; ts >= 1; ts--) {
    chars = Math.max(8, Math.floor(tw / (CHAR_W * ts)));
    title = wrap(lesson.title, chars);
    intro = wrap(lesson.intro, chars);
    steps = lesson.steps.map((step) => wrap(step, chars - 2));
    const lines = 1 + title.length + intro.length + steps.reduce((n, st) => n + st.length, 0);
    const height = lines * (CHAR_H + 3) * ts + (11 + 2 * steps.length) * ts;
    if (height <= VISIBLE * cell - reserve) break;
  }
  const fs = Math.max(1, ts);
  const lineH = (CHAR_H + 3) * fs;

  let y = oy;
  s.text(`LESSON ${t.index + 1}/${LESSONS.length}`, tx, y, fs, C.dim);
  y += lineH + fs * 2;
  for (const line of title) {
    s.text(line, tx, y, fs, C.accent);
    y += lineH;
  }
  y += fs * 4;
  for (const line of intro) {
    s.text(line, tx, y, fs, C.text);
    y += lineH;
  }
  y += fs * 5;
  steps.forEach((step, i) => {
    s.text(`${i + 1}`, tx, y, fs, C.accent);
    for (const line of step) {
      s.text(line, tx + 2 * CHAR_W * fs, y, fs, C.dim);
      y += lineH;
    }
    y += fs * 2;
  });

  // Status block pinned to the bottom of the text column.
  if (t.state === 'play') {
    if (showNext) {
      const top = bottom - 3 * nextCell;
      s.text('NEXT', tx, top + nextCell, fs, C.dim);
      const x0 = tx + 5 * CHAR_W * fs;
      game.queue.slice(0, 3).forEach((type, i) => {
        preview(s, type, x0 + i * 5 * nextCell, top, 5 * nextCell, 3 * nextCell, nextCell);
      });
    }
  } else {
    const done = t.state === 'done';
    const lines = done
      ? [...game.popup.slice(0, 2), '', `${v.nextKey}: NEXT LESSON`, `${v.retryKey}: AGAIN`]
      : t.failedOn === 'placement'
        ? ['NOT QUITE.', 'THAT PIECE NEEDS TO', 'MATCH THE OUTLINE.', '', `${v.retryKey}: TRY AGAIN`]
        : ['NOT QUITE.', 'THE LAST MOVE MUST BE', 'THE ROTATION.', '', `${v.retryKey}: TRY AGAIN`];
    const top = bottom - lines.length * lineH - fs * 6;
    panel(s, tx - fs * 3, top - fs * 3, tw, bottom - top + fs * 3);
    s.rect(tx - fs * 3, top - fs * 3, fs * 2, bottom - top + fs * 3, done ? C.good : C.bad);
    lines.forEach((line, i) => {
      const first = done ? i < 2 : i === 0;
      s.text(line, tx + fs * 3, top + i * lineH, fs, first ? (done ? C.good : C.bad) : C.text);
    });
  }
}

export interface MenuItem {
  label: string;
  value?: string;
  /** The value can be changed with left/right; shown with arrows when selected. */
  adjust?: boolean;
  /** Start a new group: draws a divider above this item. */
  sep?: boolean;
}

export interface MenuView {
  title: string;
  /** Show the wordmark with the T emblem instead of a plain heading. */
  logo?: boolean;
  /** Draw over the current frame instead of clearing. */
  overlay?: boolean;
  /** Centred lines at the top of the card (results, for example). */
  info?: string[];
  items: MenuItem[];
  sel: number;
  /** One line about the selected item, shown under the card. */
  desc?: string;
  /** Key reminders along the bottom: [key, what it does]. */
  hints?: [string, string][];
}

const ROW_U = 15;   // list row height, in text-scale units
const SEP_U = 7;    // extra height for a group divider
const PAD_U = 6;    // card padding
const CHIP_U = CHAR_H + 4;

const chipW = (text: string): number => text.length * CHAR_W - 1 + 6;
const chipsW = (names: string[]): number => names.reduce((w, n) => w + chipW(n) + 3, -3);

/** A keycap: returns its width in pixels. */
function chip(s: Surface, x: number, y: number, text: string, fs: number, bright: boolean): number {
  const w = chipW(text) * fs;
  s.rect(x, y, w, CHIP_U * fs, C.keyEdge);
  s.rect(x, y, w, (CHIP_U - 1) * fs, bright ? C.keyOn : C.key);
  s.text(text, x + 3 * fs, y + 2 * fs, fs, bright ? C.text : C.dim);
  return w;
}

function card(s: Surface, x: number, y: number, w: number, h: number): void {
  s.rect(x - 1, y - 1, w + 2, h + 2, C.faint);
  s.rect(x, y, w, h, C.card);
}

function hintBar(s: Surface, hints: [string, string][], fs: number): void {
  const widthU = hints.reduce((w, [k, t]) => w + chipW(k) + 3 + t.length * CHAR_W + (t ? 8 : 0), -8);
  const hs = Math.max(1, Math.min(fs, Math.floor((s.w - 12) / widthU)));
  let x = (s.w - widthU * hs) >> 1;
  const y = s.h - (CHIP_U + 5) * hs;
  for (const [key, what] of hints) {
    x += chip(s, x, y, key, hs, false) + 3 * hs;
    s.text(what, x, y + 2 * hs, hs, C.hint);
    x += (what.length * CHAR_W + (what ? 8 : 0)) * hs;
  }
}

function heading(s: Surface, title: string, logo: boolean, cx: number, y: number, fs: number): number {
  if (!logo) {
    s.text(title, cx, y, fs + 1, C.accent, 0);
    return CHAR_H * (fs + 1);
  }
  // Wordmark with a T emblem built from four tiles.
  const ts = fs * 3;
  const size = Math.floor((CHAR_H * ts) / 2);
  const textW = s.textWidth(title, ts);
  const x = cx - ((3 * size + 3 * ts + textW) >> 1);
  for (let i = 0; i < 3; i++) tile(s, x + i * size, y, size, 6);
  tile(s, x + size, y + size, size, 6);
  s.text(title, x + 3 * size + 3 * ts, y, ts, C.text);
  return 2 * size;
}

export function drawMenu(s: Surface, m: MenuView): void {
  if (m.overlay) s.shade(0, 0, s.w, s.h, C.bg, 0.86);
  else s.clear(C.bg);

  const info = m.info ?? [];
  let chars = m.logo ? 30 : 18;
  for (const it of m.items) chars = Math.max(chars, it.label.length + (it.value ? it.value.length + 7 : 0));
  for (const line of info) chars = Math.max(chars, line.length);
  const seps = m.items.filter((it, i) => it.sep && i > 0).length;
  const infoU = info.length ? info.length * (CHAR_H + 4) + SEP_U : 0;
  const cardU = PAD_U * 2 + infoU + m.items.length * ROW_U + seps * SEP_U;
  const headU = m.logo ? CHAR_H * 3 : CHAR_H + 3;
  const totalU = headU + 10 + cardU + (m.desc !== undefined ? 8 + CHAR_H : 0);
  const fs = Math.max(1, Math.min(
    Math.round(Math.min(s.w, s.h) / 270),
    Math.floor((s.w - 12) / (chars * CHAR_W + PAD_U * 2 + 8)),
    Math.floor(s.h / (totalU + (m.hints ? CHIP_U + 14 : 8))),
  ));

  const cx = s.w >> 1;
  const cardW = (chars * CHAR_W + PAD_U * 2) * fs;
  const x0 = cx - (cardW >> 1);
  const bottom = m.hints ? s.h - (CHIP_U + 9) * fs : s.h;
  let y = Math.max(4 * fs, (bottom - totalU * fs) >> 1);

  y += heading(s, m.title, !!m.logo, cx, y, fs) + 10 * fs;
  card(s, x0, y, cardW, cardU * fs);
  y += PAD_U * fs;

  for (const line of info) {
    s.text(line, cx, y + 2 * fs, fs, line === 'NEW BEST!' ? C.accent : C.text, 0);
    y += (CHAR_H + 4) * fs;
  }
  if (info.length) {
    s.rect(x0 + PAD_U * fs, y + 3 * fs, cardW - PAD_U * 2 * fs, 1, C.faint);
    y += SEP_U * fs;
  }

  const tx = x0 + (PAD_U + 4) * fs;
  const vx = x0 + cardW - (PAD_U + 4) * fs;
  const textY = ((ROW_U - CHAR_H) >> 1) * fs;
  m.items.forEach((it, i) => {
    if (it.sep && i > 0) {
      s.rect(x0 + PAD_U * fs, y + 3 * fs, cardW - PAD_U * 2 * fs, 1, C.faint);
      y += SEP_U * fs;
    }
    const on = i === m.sel;
    if (on) {
      s.rect(x0 + 2 * fs, y, cardW - 4 * fs, ROW_U * fs, C.select);
      s.rect(x0 + 2 * fs, y, 2 * fs, ROW_U * fs, C.accent);
    }
    s.text(it.label, tx, y + textY, fs, on ? C.text : C.dim);
    if (it.value) {
      const value = on && it.adjust ? `< ${it.value} >` : it.adjust ? `${it.value}  ` : it.value;
      s.text(value, vx, y + textY, fs, on ? C.accent : C.hint, 1);
    }
    y += ROW_U * fs;
  });
  y += PAD_U * fs;

  if (m.desc) {
    const ds = fit([m.desc], s.w - 12, fs);
    s.text(m.desc, cx, y + 8 * fs, ds, C.dim, 0);
  }
  if (m.hints) hintBar(s, m.hints, fs);
}

export interface BindingRow {
  label: string;
  keys: string[];
  pad: string[];
}

export interface BindingsView {
  rows: BindingRow[];
  /** Plain rows under the table (reset, back). */
  extra: string[];
  sel: number;
  /** Waiting for the player to press the new key or button. */
  capturing: boolean;
  hints: [string, string][];
}

export function drawBindings(s: Surface, v: BindingsView): void {
  s.clear(C.bg);
  const rowU = CHIP_U + 3;
  let labelU = 0, keysU = chipW('KEYBOARD') - 6, padU = chipW('GAMEPAD') - 6;
  for (const r of v.rows) {
    labelU = Math.max(labelU, r.label.length * CHAR_W);
    keysU = Math.max(keysU, chipsW(r.keys));
    padU = Math.max(padU, chipsW(r.pad));
  }
  const colGap = 10;
  const innerU = labelU + colGap + keysU + colGap + padU + 8;
  const cardU = PAD_U * 2 + (CHAR_H + 6) + v.rows.length * rowU + SEP_U + v.extra.length * rowU;
  const totalU = CHAR_H + 3 + 10 + cardU;
  const fs = Math.max(1, Math.min(
    Math.round(Math.min(s.w, s.h) / 270),
    Math.floor((s.w - 12) / (innerU + PAD_U * 2)),
    Math.floor(s.h / (totalU + CHIP_U + 14)),
  ));

  const cx = s.w >> 1;
  const cardW = (innerU + PAD_U * 2) * fs;
  const x0 = cx - (cardW >> 1);
  let y = Math.max(4 * fs, (s.h - (CHIP_U + 9) * fs - totalU * fs) >> 1);

  y += heading(s, 'CONTROLS', false, cx, y, fs) + 10 * fs;
  card(s, x0, y, cardW, cardU * fs);
  y += PAD_U * fs;

  const lx = x0 + (PAD_U + 4) * fs;
  const kx = lx + (labelU + colGap) * fs;
  const px = kx + (keysU + colGap) * fs;
  s.text('ACTION', lx, y, fs, C.hint);
  s.text('KEYBOARD', kx, y, fs, C.hint);
  s.text('GAMEPAD', px, y, fs, C.hint);
  y += (CHAR_H + 6) * fs;

  const textY = ((rowU - CHAR_H) >> 1) * fs;
  const chipY = ((rowU - CHIP_U) >> 1) * fs;
  const highlight = (): void => {
    s.rect(x0 + 2 * fs, y, cardW - 4 * fs, rowU * fs, C.select);
    s.rect(x0 + 2 * fs, y, 2 * fs, rowU * fs, C.accent);
  };
  v.rows.forEach((r, i) => {
    const on = i === v.sel;
    if (on) highlight();
    s.text(r.label, lx, y + textY, fs, on ? C.text : C.dim);
    if (on && v.capturing) {
      s.text('PRESS A KEY OR BUTTON', kx, y + textY, fit(['PRESS A KEY OR BUTTON'], x0 + cardW - kx - 4 * fs, fs), C.accent);
    } else {
      let x = kx;
      for (const k of r.keys) x += chip(s, x, y + chipY, k, fs, on) + 3 * fs;
      x = px;
      for (const k of r.pad) x += chip(s, x, y + chipY, k, fs, on) + 3 * fs;
    }
    y += rowU * fs;
  });

  s.rect(x0 + PAD_U * fs, y + 3 * fs, cardW - PAD_U * 2 * fs, 1, C.faint);
  y += SEP_U * fs;
  v.extra.forEach((label, i) => {
    const on = v.rows.length + i === v.sel;
    if (on) highlight();
    s.text(label, lx, y + textY, fs, on ? C.text : C.dim);
    y += rowU * fs;
  });

  hintBar(s, v.hints, fs);
}
