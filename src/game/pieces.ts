// Piece shapes and rotation kick tables.
// Coordinates are (x right, y down) inside each piece's bounding box.

export const I = 1, J = 2, L = 3, O = 4, S = 5, T = 6, Z = 7, RUBBLE = 8;
export const PIECE_NAMES = ['', 'I', 'J', 'L', 'O', 'S', 'T', 'Z'];

const BOX = [0, 4, 3, 3, 2, 3, 3, 3];

const SPAWN_CELLS: number[][] = [
  [],
  [0, 1, 1, 1, 2, 1, 3, 1], // I
  [0, 0, 0, 1, 1, 1, 2, 1], // J
  [2, 0, 0, 1, 1, 1, 2, 1], // L
  [0, 0, 1, 0, 0, 1, 1, 1], // O
  [1, 0, 2, 0, 0, 1, 1, 1], // S
  [1, 0, 0, 1, 1, 1, 2, 1], // T
  [0, 0, 1, 0, 1, 1, 2, 1], // Z
];

/** SHAPES[type][rotation] = flat list of x,y pairs. Rotation 0=spawn, 1=right, 2=flipped, 3=left. */
export const SHAPES: Int8Array[][] = SPAWN_CELLS.map((cells, type) => {
  const n = BOX[type];
  const rots: Int8Array[] = [];
  let cur = cells;
  for (let r = 0; r < 4; r++) {
    rots.push(Int8Array.from(cur));
    const next: number[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(n - 1 - cur[i + 1], cur[i]);
    cur = next;
  }
  return rots;
});

export function boxSize(type: number): number {
  return BOX[type];
}

// Kick offsets are written x right, y UP (the conventional notation) and
// converted when applied.
type Kicks = Record<string, number[][]>;

const KICKS_3: Kicks = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const KICKS_I: Kicks = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const KICKS_FLIP = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]];
const KICKS_NONE = [[0, 0]];

export function kicks(type: number, from: number, to: number): number[][] {
  if (type === O) return KICKS_NONE;
  if ((from + 2) % 4 === to) return KICKS_FLIP;
  return (type === I ? KICKS_I : KICKS_3)['' + from + to];
}
