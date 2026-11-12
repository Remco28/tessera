# Tessera

A small falling-block puzzle game for Linux with modern stacker rules:
7-bag randomizer, wall kicks, hold, ghost piece, five-piece preview, lock
delay with move reset, T-spin / mini / back-to-back / combo scoring.

Modes: endless **Marathon**, 40-line **Sprint**, two-minute **Ultra**,
**Cleanup** (the board starts full of rubble; clear all of it), **Practice**
(no gravity, pieces lock only on hard drop, unlimited undo) and a nine-lesson
**T-Spin School** (six on the twists, three on building the setups).

## Run

    npm install
    bin/tessera          # or: npm start
    bin/tessera --top    # ask the window manager to keep it above other windows

Needs Node 22.18 or newer. There is no build step: Node runs the TypeScript
directly. The window is freely resizable and everything scales to it.

## Controls

| Action      | Keyboard    | Gamepad          |
|-------------|-------------|------------------|
| Move        | Left, Right | D-pad, left stick |
| Soft drop   | Down        | D-pad down       |
| Hard drop   | Space       | D-pad up         |
| Rotate CW   | Up, X       | B                |
| Rotate CCW  | Z           | A                |
| Rotate 180  | A           | Y                |
| Hold        | C, Shift    | Shoulder buttons |
| Pause       | Esc, P      | Start            |
| Retry       | R           | Back             |
| Undo (practice) | Backspace | X              |

Rebind from the in-game **Controls** screen; repeat delay (DAS), repeat rate
(ARR) and soft drop speed are under **Settings**. Or edit
`~/.config/tessera/config.json` by hand; each action takes a list, so an
action can have several keys or buttons. Best scores live in `scores.json`
next to it.

## Icon and app menu

`assets/icon.png` is used as the window icon. It is drawn by
`tools/make-icon.py` (needs Pillow); tweak the constants at the top of that
script and re-run it to change the artwork. Run `bin/install-desktop` once to add Tessera to
the application menu with that icon.

## Development

    npm test         # rules engine and tutorial lessons
    npm run check    # typecheck

`src/game` is the rules engine (no I/O), `src/render` is a tiny software
rasteriser and the screens, `src/main.ts` owns the window, input and loop.
