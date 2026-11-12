import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SPIN_FULL, SPIN_MINI, SPIN_NONE, H, W, msPerRow } from '../src/game/engine.ts';
import type { Action, LockEvent } from '../src/game/engine.ts';
import { Tutorial, LESSONS } from '../src/game/tutorial.ts';
import { I, O, T, SHAPES } from '../src/game/pieces.ts';

const handling = { das: 150, arr: 25, sdf: 0 };
const tap = (g: Game, ...actions: Action[]) => {
  for (const a of actions) { g.press(a); g.release(a); }
};
/** Instant soft drop to the floor without locking. */
const sink = (g: Game) => { g.press('soft'); g.update(1); g.release('soft'); };

function capture(g: Game): LockEvent[] {
  const events: LockEvent[] = [];
  const prev = g.onLock;
  g.onLock = (e) => { events.push(e); prev?.(e); };
  return events;
}

test('each rotation state has four distinct cells', () => {
  for (let t = 1; t <= 7; t++) for (let r = 0; r < 4; r++) {
    const s = SHAPES[t][r];
    const set = new Set<number>();
    for (let i = 0; i < 8; i += 2) set.add(s[i] * 10 + s[i + 1]);
    assert.equal(set.size, 4);
  }
});

test('7-bag deals every piece once per seven', () => {
  const g = new Game({ mode: 'marathon', handling });
  assert.deepEqual([g.active!.type, ...g.queue.slice(0, 6)].sort(), [1, 2, 3, 4, 5, 6, 7]);
});

test('gravity speeds up with level', () => {
  assert.equal(msPerRow(1), 1000);
  assert.ok(msPerRow(10) < msPerRow(5));
  assert.ok(msPerRow(20) < 17);
});

test('four I pieces side by side do not clear; a quad scores 800', () => {
  const g = new Game({ mode: 'marathon', handling, sequence: [I], board: ['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.'] });
  const ev = capture(g);
  tap(g, 'cw');
  g.press('right'); g.update(400); g.release('right');
  tap(g, 'hard');
  assert.equal(ev[0].lines, 4);
  assert.equal(g.lines, 4);
  assert.ok(g.score >= 800 + 2000, 'quad plus perfect clear');
  assert.deepEqual(g.popup.slice(0, 1), ['QUAD']);
});

test('hold swaps once per piece', () => {
  const g = new Game({ mode: 'marathon', handling, sequence: [I, O, T] });
  tap(g, 'hold');
  assert.equal(g.hold, I);
  assert.equal(g.active!.type, O);
  tap(g, 'hold');
  assert.equal(g.active!.type, O, 'second hold is ignored');
  tap(g, 'hard');
  tap(g, 'hold');
  assert.equal(g.active!.type, I);
  assert.equal(g.hold, T);
});

test('DAS slides to the wall, piece locks after the lock delay', () => {
  const g = new Game({ mode: 'marathon', handling, sequence: [O] });
  g.press('left');
  for (let i = 0; i < 40; i++) g.update(10);
  assert.equal(g.active!.x, 0);
  g.release('left');
  sink(g);
  assert.ok(g.active, 'still active while lock delay runs');
  for (let i = 0; i < 60; i++) g.update(10);
  assert.equal(g.active, null);
  assert.equal(g.cell(0, H - 1), O);
});

test('a plain drop of a T is not a spin', () => {
  const g = new Game({ mode: 'marathon', handling, sequence: [T] });
  const ev = capture(g);
  tap(g, 'hard');
  assert.equal(ev[0].spin, SPIN_NONE);
});

test('stacking to the top ends the game', () => {
  const g = new Game({ mode: 'marathon', handling });
  for (let i = 0; i < 60 && !g.over; i++) tap(g, 'hard');
  assert.ok(g.over);
  assert.equal(g.won, false);
});

test('cleanup mode starts messy and is won by clearing the rubble', () => {
  const g = new Game({ mode: 'cleanup', handling, cleanupHeight: 6 });
  assert.ok(g.rubble > 6);
  for (let y = H - 6; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (g.cell(x, y)) n++;
    assert.ok(n > 0 && n < W);
  }
  const one = new Game({ mode: 'cleanup', handling, cleanupHeight: 0, sequence: [I], board: ['XXXXXX....'] });
  assert.equal(one.rubble, 6);
  one.press('right'); one.update(300); one.release('right');
  tap(one, 'hard');
  assert.ok(one.over && one.won);
});

test('practice mode has no gravity or lock timer, and can undo', () => {
  const g = new Game({ mode: 'practice', handling });
  const y = g.active!.y;
  for (let i = 0; i < 500; i++) g.update(16);
  assert.equal(g.active!.y, y, 'piece does not fall on its own');
  sink(g);
  for (let i = 0; i < 200; i++) g.update(16);
  assert.ok(g.active && g.pieces === 0, 'resting on the floor does not lock');

  const first = g.active!.type;
  const queue = g.queue.slice();
  tap(g, 'hard');
  assert.equal(g.pieces, 1);
  tap(g, 'hold', 'hard');
  assert.equal(g.pieces, 2);
  assert.ok(g.undo());
  assert.ok(g.undo());
  assert.equal(g.pieces, 0);
  assert.equal(g.active!.type, first);
  assert.deepEqual(g.queue, queue);
  assert.equal(g.hold, 0);
  assert.ok(g.board.every((v) => v === 0));
  assert.equal(g.undo(), false);

  for (let i = 0; i < 80; i++) tap(g, 'hard');
  assert.equal(g.over, false, 'topping out wipes the board instead of ending');
});

test('undo is ignored outside practice', () => {
  const g = new Game({ mode: 'marathon', handling });
  tap(g, 'hard');
  assert.equal(g.undo(), false);
});

// Scripted solutions: what the lesson text tells the player to do.
const SOLUTIONS: ((g: Game) => void)[] = [
  (g) => { tap(g, 'cw'); sink(g); tap(g, 'cw', 'hard'); },
  (g) => { tap(g, 'cw'); sink(g); tap(g, 'cw', 'hard'); },
  (g) => { tap(g, 'left', 'left', 'hard'); tap(g, 'cw'); sink(g); tap(g, 'cw', 'hard'); },
  (g) => { tap(g, 'right', 'right', 'hard'); tap(g, 'ccw'); sink(g); tap(g, 'ccw', 'hard'); },
  (g) => { tap(g, 'left'); sink(g); tap(g, 'left', 'cw', 'hard'); },
  (g) => { tap(g, 'left', 'left', 'left'); sink(g); tap(g, 'cw', 'hard'); },
  (g) => { tap(g, 'cw', 'left', 'left', 'hard'); tap(g, 'cw'); sink(g); tap(g, 'cw', 'hard'); },
  (g) => {
    tap(g, 'left', 'left', 'left', 'hard');
    tap(g, 'left', 'left', 'left', 'hard');
    tap(g, 'left', 'left', 'hard');
    tap(g, 'cw'); sink(g); tap(g, 'cw', 'hard');
  },
  (g) => {
    tap(g, 'right', 'right', 'right', 'hard');
    tap(g, 'right', 'right', 'right', 'right', 'hard');
    tap(g, 'right', 'right', 'right', 'hard');
    tap(g, 'ccw', 'right'); sink(g); tap(g, 'ccw', 'hard');
  },
];

for (let i = 0; i < LESSONS.length; i++) {
  test(`lesson ${i + 1} (${LESSONS[i].title}) is solvable as described`, () => {
    const t = new Tutorial(handling, i);
    const ev = capture(t.game);
    SOLUTIONS[i](t.game);
    const last = ev[ev.length - 1];
    assert.equal(t.state, 'done', `spin=${last.spin} lines=${last.lines} at ${last.x},${last.y} rot ${last.rot}`);
    assert.equal(ev.length, LESSONS[i].sequence.length);
    ev.forEach((e, n) => assert.deepEqual({ x: e.x, y: e.y, rot: e.rot }, LESSONS[i].targets[n], `piece ${n + 1}`));
    assert.ok(last.spin === SPIN_FULL || last.spin === SPIN_MINI);
  });

  test(`lesson ${i + 1} fails on a plain hard drop`, () => {
    const t = new Tutorial(handling, i);
    for (let n = 0; n < 4 && t.state === 'play'; n++) tap(t.game, 'hard');
    assert.equal(t.state, 'failed');
  });
}
