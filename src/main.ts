// Tessera: window, input devices, screens and the main loop.

import sdl from '@kmamal/sdl';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Game, SPRINT_LINES } from './game/engine.ts';
import type { Action, ModeId } from './game/engine.ts';
import { Tutorial, LESSONS } from './game/tutorial.ts';
import { Surface } from './render/gfx.ts';
import { drawBindings, drawGame, drawMenu, drawTutorial, formatTime } from './render/draw.ts';
import type { BindingsView, MenuItem, MenuView } from './render/draw.ts';
import { BIND_ACTIONS, defaults, loadConfig, loadScores, saveConfig, saveScores } from './config.ts';
import type { BindAction, Bindings } from './config.ts';
import { loadIcon } from './icon.ts';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: tessera [--top]\n\n  --top   ask the window manager to keep the window above others');
  process.exit(0);
}

// ---- event polling ---------------------------------------------------------
// The SDL binding polls for events on a 1 ms timer whenever a listener is
// attached, which keeps a core busy for no reason. Take the pump over so it
// runs from our own loop at a rate that suits what is on screen. If the
// binding's internals ever change, this quietly falls back to its own timer.
function takeOverPolling(): () => void {
  try {
    const require = createRequire(import.meta.url);
    const globals = require(join(dirname(require.resolve('@kmamal/sdl')), 'globals.js'));
    const ev = globals.events;
    if (typeof ev?.poll === 'function' && typeof ev.stopPolling === 'function') {
      ev.stopPolling();
      ev.switchToPollingFast = () => {};
      ev.switchToPollingSlow = () => {};
      return ev.poll;
    }
  } catch { /* fall through */ }
  return () => {};
}
const pollEvents = takeOverPolling();

// ---- state -----------------------------------------------------------------

type Screen = 'menu' | 'play' | 'tutorial' | 'controls' | 'settings';
type Nav = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back';

const cfg = loadConfig();
const scores = loadScores();
const surface = new Surface();

let screen: Screen = 'menu';
let overlay: 'pause' | 'over' | null = null;
let game: Game | null = null;
let tutorial: Tutorial | null = null;
let menuSel = 0;
let ctrlSel = 0;
let overlaySel = 0;
let capturing = false;
let newBest = false;
let dirty = true;
let focused = true;
let lastTenth = -1;
let closed = false;
let overAt = 0;

const MODES: ModeId[] = ['marathon', 'sprint', 'ultra', 'cleanup', 'practice', 'tutorial'];
const SOFT_RATES = [10, 15, 20, 25, 30, 40, 60, 0];

const NAV_KEYS: Record<string, Nav> = {
  up: 'up', down: 'down', left: 'left', right: 'right',
  return: 'ok', enter: 'ok', space: 'ok', escape: 'back', backspace: 'back',
};
const NAV_PAD: Record<string, Nav> = {
  dpadUp: 'up', dpadDown: 'down', dpadLeft: 'left', dpadRight: 'right',
  stickUp: 'up', stickDown: 'down', stickLeft: 'left', stickRight: 'right',
  a: 'ok', start: 'ok', b: 'back',
};

let keyMap = new Map<string, BindAction[]>();
let padMap = new Map<string, BindAction[]>();

function buildMap(b: Bindings): Map<string, BindAction[]> {
  const m = new Map<string, BindAction[]>();
  for (const { id } of BIND_ACTIONS) {
    for (const name of b[id] ?? []) {
      const list = m.get(name);
      if (list) list.push(id);
      else m.set(name, [id]);
    }
  }
  return m;
}

function rebuildMaps(): void {
  keyMap = buildMap(cfg.keys);
  padMap = buildMap(cfg.pad);
}
rebuildMaps();

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const current = (): Game | null => (screen === 'tutorial' ? tutorial?.game ?? null : screen === 'play' ? game : null);
const playing = (): boolean => (screen === 'play' || screen === 'tutorial') && !overlay;
const INPUT_LABELS: Record<string, string> = {
  escape: 'ESC', backspace: 'BKSP', return: 'ENTER', pageUp: 'PGUP', pageDown: 'PGDN', capsLock: 'CAPS',
  dpadLeft: 'D-LEFT', dpadRight: 'D-RIGHT', dpadUp: 'D-UP', dpadDown: 'D-DOWN',
  stickLeft: 'STICK L', stickRight: 'STICK R', stickUp: 'STICK U', stickDown: 'STICK D',
  leftShoulder: 'LB', rightShoulder: 'RB', leftTrigger: 'LT', rightTrigger: 'RT',
  leftStick: 'L3', rightStick: 'R3',
};
/** Short display name for a key or gamepad button. */
const inputLabel = (name: string): string => INPUT_LABELS[name] ?? name.toUpperCase();
const keyLabel = (b: Bindings, a: BindAction): string => (b[a]?.[0] ? inputLabel(b[a][0]) : '?');

// ---- scores ----------------------------------------------------------------

function bestText(mode: ModeId): string {
  switch (mode) {
    case 'marathon': return scores.marathon ? String(scores.marathon) : '';
    case 'ultra': return scores.ultra ? String(scores.ultra) : '';
    case 'sprint': return scores.sprint ? formatTime(scores.sprint, 2) : '';
    case 'cleanup': {
      const t = scores.cleanup[String(cfg.cleanupHeight)];
      return t ? formatTime(t, 2) : '';
    }
    default: return '';
  }
}

function recordScore(g: Game): void {
  newBest = false;
  if (g.mode === 'marathon' && g.score > scores.marathon) {
    scores.marathon = g.score;
    newBest = true;
  } else if (g.mode === 'ultra' && g.won && g.score > scores.ultra) {
    scores.ultra = g.score;
    newBest = true;
  } else if (g.mode === 'sprint' && g.won && (!scores.sprint || g.timeMs < scores.sprint)) {
    scores.sprint = Math.round(g.timeMs);
    newBest = true;
  } else if (g.mode === 'cleanup' && g.won) {
    const k = String(cfg.cleanupHeight);
    if (!scores.cleanup[k] || g.timeMs < scores.cleanup[k]) {
      scores.cleanup[k] = Math.round(g.timeMs);
      newBest = true;
    }
  }
  if (newBest) saveScores(scores);
}

// ---- screen transitions ----------------------------------------------------

function start(mode: ModeId): void {
  overlay = null;
  lastTenth = -1;
  if (mode === 'tutorial') {
    tutorial = new Tutorial(cfg.handling, cfg.lesson);
    screen = 'tutorial';
  } else {
    game = new Game({ mode, handling: cfg.handling, startLevel: cfg.startLevel, cleanupHeight: cfg.cleanupHeight });
    screen = 'play';
  }
  dirty = true;
}

function restart(): void {
  if (screen === 'tutorial') {
    tutorial!.restart();
    overlay = null;
    dirty = true;
  } else if (game) {
    start(game.mode);
  }
}

function gotoLesson(index: number): void {
  tutorial!.start(index);
  cfg.lesson = tutorial!.index;
  overlay = null;
  dirty = true;
}

function toMenu(): void {
  screen = 'menu';
  overlay = null;
  game = null;
  tutorial = null;
  saveConfig(cfg);
  dirty = true;
}

function openPause(): void {
  current()?.releaseAll();
  overlay = 'pause';
  overlaySel = 0;
  dirty = true;
}

function quit(): void {
  if (closed) return;
  saveConfig(cfg);
  win.destroy();
}

// ---- menus -----------------------------------------------------------------

const NAV_HINTS: [string, string][] = [['UP', ''], ['DOWN', 'CHOOSE'], ['ENTER', 'SELECT'], ['ESC', 'BACK']];

const MENU_DESC = [
  'ENDLESS. SPEEDS UP EVERY 10 LINES.',
  `CLEAR ${SPRINT_LINES} LINES AS FAST AS YOU CAN.`,
  'SCORE AS MUCH AS YOU CAN IN 2 MINUTES.',
  'THE BOARD STARTS MESSY. CLEAR ALL THE RUBBLE.',
  'NO GRAVITY, UNLIMITED UNDO. BUILD SETUPS FREELY.',
  'GUIDED LESSONS: THE TWISTS, THEN THE SETUPS.',
  'KEYBOARD AND GAMEPAD BINDINGS.',
  'HANDLING AND DISPLAY OPTIONS.',
  '',
];

function menuView(): MenuView {
  const items: MenuItem[] = [
    { label: 'MARATHON', value: `LEVEL ${cfg.startLevel}`, adjust: true, head: 'GAME MODES' },
    { label: 'SPRINT', value: `${SPRINT_LINES} LINES` },
    { label: 'ULTRA', value: '2 MINUTES' },
    { label: 'CLEANUP', value: `HEIGHT ${cfg.cleanupHeight}`, adjust: true },
    { label: 'PRACTICE', value: 'NO GRAVITY' },
    { label: 'T-SPIN SCHOOL', value: `LESSON ${cfg.lesson + 1}/${LESSONS.length}`, adjust: true },
    { label: 'CONTROLS', sep: true, head: 'OPTIONS' },
    { label: 'SETTINGS' },
    { label: 'QUIT' },
  ];
  const best = menuSel < 4 ? bestText(MODES[menuSel]) : '';
  const lesson = menuSel === 5 ? `   NEXT: ${LESSONS[cfg.lesson].title}` : '';
  return {
    title: 'TESSERA',
    logo: true,
    items,
    sel: menuSel,
    desc: MENU_DESC[menuSel] + (best ? `   BEST ${best}` : '') + lesson,
    hints: [['UP', ''], ['DOWN', 'CHOOSE'], ['LEFT', ''], ['RIGHT', 'ADJUST'], ['ENTER', 'GO']],
  };
}

function menuNav(n: Nav): void {
  const count = 9;
  if (n === 'up') menuSel = (menuSel + count - 1) % count;
  else if (n === 'down') menuSel = (menuSel + 1) % count;
  else if (n === 'left' || n === 'right') {
    const d = n === 'left' ? -1 : 1;
    if (menuSel === 0) cfg.startLevel = clamp(cfg.startLevel + d, 1, 20);
    else if (menuSel === 3) cfg.cleanupHeight = clamp(cfg.cleanupHeight + d, 2, 14);
    else if (menuSel === 5) cfg.lesson = (cfg.lesson + d + LESSONS.length) % LESSONS.length;
  } else if (n === 'ok') {
    if (menuSel < 6) start(MODES[menuSel]);
    else if (menuSel === 6 || menuSel === 7) {
      screen = menuSel === 6 ? 'controls' : 'settings';
      ctrlSel = 0;
    } else quit();
  } else if (n === 'back') {
    quit();
  }
  dirty = true;
}

const N_BINDS = BIND_ACTIONS.length;

function controlsView(): BindingsView {
  return {
    rows: BIND_ACTIONS.map(({ id, label }) => ({
      label,
      keys: (cfg.keys[id] ?? []).map(inputLabel),
      pad: (cfg.pad[id] ?? []).map(inputLabel),
    })),
    extra: ['RESET BINDINGS', 'BACK'],
    sel: ctrlSel,
    capturing,
    hints: capturing ? [['ESC', 'CANCEL']] : [['UP', ''], ['DOWN', 'CHOOSE'], ['ENTER', 'REBIND'], ['ESC', 'BACK']],
  };
}

function controlsNav(n: Nav): void {
  const count = N_BINDS + 2;
  const row = ctrlSel - N_BINDS;
  if (n === 'up') ctrlSel = (ctrlSel + count - 1) % count;
  else if (n === 'down') ctrlSel = (ctrlSel + 1) % count;
  else if (n === 'ok') {
    if (row < 0) capturing = true;
    else if (row === 0) {
      const d = defaults();
      cfg.keys = d.keys;
      cfg.pad = d.pad;
      rebuildMaps();
      saveConfig(cfg);
    } else toMenu();
  } else if (n === 'back') {
    toMenu();
  }
  dirty = true;
}

function settingsView(): MenuView {
  const h = cfg.handling;
  return {
    title: 'SETTINGS',
    items: [
      { label: 'REPEAT DELAY (DAS)', value: `${h.das} MS`, adjust: true },
      { label: 'REPEAT RATE (ARR)', value: h.arr ? `${h.arr} MS` : 'INSTANT', adjust: true },
      { label: 'SOFT DROP SPEED', value: h.softRate ? `${h.softRate} ROWS/S` : 'INSTANT', adjust: true },
      { label: 'GHOST PIECE', value: cfg.ghost ? 'ON' : 'OFF', adjust: true, sep: true },
      { label: 'PAUSE WHEN UNFOCUSED', value: cfg.pauseOnBlur ? 'ON' : 'OFF', adjust: true },
      { label: 'RESET SETTINGS', sep: true },
      { label: 'BACK' },
    ],
    sel: ctrlSel,
    desc: [
      'HOW LONG A HELD DIRECTION WAITS BEFORE REPEATING.',
      'HOW FAST A HELD DIRECTION REPEATS.',
      'SOFT DROP SPEED AS A MULTIPLE OF GRAVITY.',
      'OUTLINE SHOWING WHERE THE PIECE WILL LAND.',
      'PAUSE WHEN ANOTHER WINDOW TAKES FOCUS.',
      '',
      '',
    ][ctrlSel],
    hints: [['LEFT', ''], ['RIGHT', 'ADJUST'], ['ESC', 'BACK']],
  };
}

function settingsNav(n: Nav): void {
  const count = 7;
  if (n === 'up') ctrlSel = (ctrlSel + count - 1) % count;
  else if (n === 'down') ctrlSel = (ctrlSel + 1) % count;
  else if (n === 'left' || n === 'right' || n === 'ok') {
    const d = n === 'left' ? -1 : 1;
    const h = cfg.handling;
    if (ctrlSel === 0 && n !== 'ok') h.das = clamp(h.das + d * 10, 30, 400);
    else if (ctrlSel === 1 && n !== 'ok') h.arr = clamp(h.arr + d * 5, 0, 100);
    else if (ctrlSel === 2 && n !== 'ok') {
      const i = Math.max(0, SOFT_RATES.indexOf(h.softRate));
      h.softRate = SOFT_RATES[clamp(i + d, 0, SOFT_RATES.length - 1)];
    } else if (ctrlSel === 3) cfg.ghost = !cfg.ghost;
    else if (ctrlSel === 4) cfg.pauseOnBlur = !cfg.pauseOnBlur;
    else if (n === 'ok' && ctrlSel === 5) {
      const def = defaults();
      cfg.handling = def.handling;
      cfg.ghost = def.ghost;
      cfg.pauseOnBlur = def.pauseOnBlur;
    } else if (n === 'ok' && ctrlSel === 6) return toMenu();
  } else if (n === 'back') {
    return toMenu();
  }
  dirty = true;
}

function capture(kind: 'key' | 'pad', name: string): void {
  capturing = false;
  dirty = true;
  if (kind === 'key' && name === 'escape') return;
  const action = BIND_ACTIONS[ctrlSel].id;
  const b = kind === 'key' ? cfg.keys : cfg.pad;
  // One input drives one action: take it away from whatever had it before.
  for (const { id } of BIND_ACTIONS) b[id] = (b[id] ?? []).filter((v) => v !== name);
  b[action] = [name];
  rebuildMaps();
  saveConfig(cfg);
}

function overlayItems(): string[] {
  if (overlay === 'over') return ['RETRY', 'MENU'];
  return screen === 'tutorial'
    ? ['RESUME', 'RESTART LESSON', 'NEXT LESSON', 'PREVIOUS LESSON', 'MENU']
    : ['RESUME', 'RESTART', 'MENU'];
}

function overlayView(): MenuView {
  const items = overlayItems().map((label) => ({ label }));
  if (overlay === 'pause') return { title: 'PAUSED', overlay: true, items, sel: overlaySel, hints: NAV_HINTS };
  const g = game!;
  const info: string[] = [];
  if (g.mode === 'marathon' || g.mode === 'ultra') {
    info.push(`SCORE ${g.score}`, `LINES ${g.lines}   LEVEL ${g.level}`);
  } else if (g.won) {
    info.push(`TIME ${formatTime(g.timeMs, 2)}`, `PIECES ${g.pieces}`);
  } else {
    info.push(g.mode === 'sprint' ? `${g.lines} OF ${SPRINT_LINES} LINES` : `${g.rubble} RUBBLE LEFT`);
  }
  const best = bestText(g.mode);
  if (newBest) info.push('NEW BEST!');
  else if (best) info.push(`BEST ${best}`);
  const title = g.won ? (g.mode === 'ultra' ? 'TIME UP' : 'CLEARED') : 'GAME OVER';
  return { title, overlay: true, info, items, sel: overlaySel, hints: NAV_HINTS };
}

function overlayNav(n: Nav): void {
  const items = overlayItems();
  if (n === 'up') overlaySel = (overlaySel + items.length - 1) % items.length;
  else if (n === 'down') overlaySel = (overlaySel + 1) % items.length;
  else if (n === 'back') {
    if (overlay === 'pause') overlay = null;
    else toMenu();
  } else if (n === 'ok') {
    switch (items[overlaySel]) {
      case 'RESUME': overlay = null; break;
      case 'RETRY':
      case 'RESTART':
      case 'RESTART LESSON': restart(); break;
      case 'NEXT LESSON': gotoLesson(tutorial!.index + 1); break;
      case 'PREVIOUS LESSON': gotoLesson(tutorial!.index - 1); break;
      case 'MENU': toMenu(); break;
    }
  }
  dirty = true;
}

// ---- input -----------------------------------------------------------------

function onDown(kind: 'key' | 'pad', name: string): void {
  if (capturing) return capture(kind, name);
  const nav = (kind === 'key' ? NAV_KEYS : NAV_PAD)[name] as Nav | undefined;
  const acts = (kind === 'key' ? keyMap : padMap).get(name) ?? [];

  if (overlay) {
    // Ignore input briefly after a game ends so mashing hard drop cannot
    // pick RETRY before the result has been seen.
    if (overlay === 'over' && performance.now() - overAt < 700) return;
    if (overlay === 'pause' && acts.includes('pause') && nav !== 'ok') {
      overlay = null;
      dirty = true;
    } else if (nav) overlayNav(nav);
    return;
  }
  if (screen === 'menu' || screen === 'controls' || screen === 'settings') {
    if (nav) (screen === 'menu' ? menuNav : screen === 'controls' ? controlsNav : settingsNav)(nav);
    return;
  }

  if (screen === 'tutorial' && tutorial!.state !== 'play') {
    if (acts.includes('pause')) openPause();
    else if (acts.includes('retry')) restart();
    else if (nav === 'ok' || acts.includes('hard')) {
      if (tutorial!.state === 'done') gotoLesson(tutorial!.index + 1);
      else restart();
    }
    return;
  }

  const g = current();
  if (!g) return;
  for (const a of acts) {
    if (a === 'pause') return openPause();
    if (a === 'retry') return restart();
    if (a === 'undo') {
      g.undo();
      continue;
    }
    g.press(a);
  }
}

function onUp(kind: 'key' | 'pad', name: string): void {
  const acts = (kind === 'key' ? keyMap : padMap).get(name);
  const g = current();
  if (!acts || !g) return;
  for (const a of acts) if (a !== 'pause' && a !== 'retry' && a !== 'undo') g.release(a as Action);
}

// ---- window ----------------------------------------------------------------

const win = sdl.video.createWindow({
  title: 'Tessera',
  width: cfg.window.width,
  height: cfg.window.height,
  resizable: true,
  accelerated: false,
  alwaysOnTop: cfg.alwaysOnTop || process.argv.includes('--top'),
});

const icon = loadIcon(join(import.meta.dirname, '..', 'assets', 'icon.png'));
if (icon) win.setIcon(icon.width, icon.height, icon.width * 4, 'rgba32', icon.pixels);

const keyName = (e: { key: string | null; scancode: number }): string =>
  e.key ? e.key.toLowerCase() : `scancode${e.scancode}`;

win.on('keyDown', (e) => {
  if (!e.repeat) onDown('key', keyName(e));
});
win.on('keyUp', (e) => onUp('key', keyName(e)));
win.on('resize', (e) => {
  cfg.window = { width: e.width, height: e.height };
  dirty = true;
});
win.on('expose', () => { dirty = true; });
win.on('focus', () => { focused = true; });
win.on('blur', () => {
  focused = false;
  current()?.releaseAll();
  if (cfg.pauseOnBlur && playing()) openPause();
});
win.on('close', () => {
  closed = true;
  saveConfig(cfg);
  process.exit(0);
});

// ---- gamepads --------------------------------------------------------------

const STICKS: Record<string, [string, string]> = {
  leftStickX: ['stickLeft', 'stickRight'],
  leftStickY: ['stickUp', 'stickDown'],
  leftTrigger: ['', 'leftTrigger'],
  rightTrigger: ['', 'rightTrigger'],
};

function openPad(device: unknown): void {
  try {
    const pad = sdl.controller.openDevice(device as never);
    const on = new Set<string>();
    const set = (name: string, active: boolean): void => {
      if (!name || on.has(name) === active) return;
      if (active) {
        on.add(name);
        onDown('pad', name);
      } else {
        on.delete(name);
        onUp('pad', name);
      }
    };
    pad.on('buttonDown', (e) => onDown('pad', String(e.button)));
    pad.on('buttonUp', (e) => onUp('pad', String(e.button)));
    pad.on('axisMotion', (e) => {
      const names = STICKS[e.axis as string];
      if (!names) return;
      // Hysteresis so a stick resting near the threshold does not chatter.
      const [neg, pos] = names;
      if (e.value < -0.6) set(neg, true);
      else if (e.value > -0.4) set(neg, false);
      if (e.value > 0.6) set(pos, true);
      else if (e.value < 0.4) set(pos, false);
    });
  } catch (err) {
    console.error(`tessera: could not open gamepad: ${(err as Error).message}`);
  }
}

for (const d of sdl.controller.devices) openPad(d);
sdl.controller.on('deviceAdd', (e) => openPad(e.device));

// ---- main loop -------------------------------------------------------------

function render(): void {
  dirty = false;
  const w = win.pixelWidth, h = win.pixelHeight;
  if (w <= 0 || h <= 0) return;
  surface.resize(w, h);
  if (screen === 'menu') drawMenu(surface, menuView());
  else if (screen === 'controls') drawBindings(surface, controlsView());
  else if (screen === 'settings') drawMenu(surface, settingsView());
  else {
    if (screen === 'tutorial') {
      drawTutorial(surface, {
        tutorial: tutorial!,
        ghost: cfg.ghost,
        retryKey: keyLabel(cfg.keys, 'retry'),
        nextKey: 'ENTER',
      });
    } else {
      const hint = game!.mode === 'practice'
        ? [`UNDO ${keyLabel(cfg.keys, 'undo')}`, `CLEAR ${keyLabel(cfg.keys, 'retry')}`]
        : undefined;
      drawGame(surface, { game: game!, ghost: cfg.ghost, best: bestText(game!.mode), hint });
    }
    if (overlay) drawMenu(surface, overlayView());
  }
  win.render(w, h, w * 4, 'rgba32', surface.bytes);
}

let last = performance.now();

function tick(): void {
  if (closed) return;
  pollEvents();
  if (closed) return;

  const now = performance.now();
  const dt = Math.min(now - last, 100);
  last = now;

  const g = current();
  if (g && !overlay) {
    g.update(dt);
    if (screen === 'play') {
      // Marathon shows whole seconds, so it only needs a redraw once a second.
      const tenth = Math.floor(g.timeMs / (g.mode === 'practice' ? 1e12 : g.mode === 'marathon' ? 1000 : 100));
      if (tenth !== lastTenth) {
        lastTenth = tenth;
        dirty = true;
      }
      if (g.over) {
        recordScore(g);
        overlay = 'over';
        overAt = performance.now();
        overlaySel = 0;
        dirty = true;
      }
    }
  }
  if (g?.dirty) {
    g.dirty = false;
    dirty = true;
  }
  if (dirty) render();

  // Poll fast only while a piece is in play; idle screens barely wake up.
  setTimeout(tick, playing() ? 8 : focused ? 30 : 150);
}

tick();
