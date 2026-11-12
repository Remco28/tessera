// Minimal software rasteriser: filled rectangles and a 5x7 bitmap font
// drawn straight into an RGBA pixel buffer. No dependencies, no GPU.

const GLYPH_ROWS: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 11011 10001',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11110 00001 00001 01110 00001 00001 11110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100',
  '/': '00001 00010 00010 00100 01000 01000 10000',
  "'": '00100 00100 01000 00000 00000 00000 00000',
  '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000',
  '<': '00010 00100 01000 10000 01000 00100 00010',
  '>': '01000 00100 00010 00001 00010 00100 01000',
  '=': '00000 00000 11111 00000 11111 00000 00000',
  '_': '00000 00000 00000 00000 00000 00000 11111',
  '%': '11001 11010 00010 00100 01000 01011 10011',
  '*': '00000 10101 01110 11111 01110 10101 00000',
};

const GLYPHS = new Map<number, Uint8Array>();
for (const [ch, rows] of Object.entries(GLYPH_ROWS)) {
  GLYPHS.set(ch.charCodeAt(0), Uint8Array.from(rows.split(' ').map((r) => parseInt(r, 2))));
}

export const CHAR_W = 6; // 5 pixels plus 1 spacing
export const CHAR_H = 7;

/** 0xRRGGBB -> the little-endian 'rgba32' word used by the buffer. */
export function rgb(hex: number): number {
  return (0xff000000 | ((hex & 0xff) << 16) | (hex & 0xff00) | (hex >>> 16)) >>> 0;
}

/** Linear mix of two buffer colours, t in 0..1 toward b. */
export function mix(a: number, b: number, t: number): number {
  const u = 1 - t;
  const r = (a & 0xff) * u + (b & 0xff) * t;
  const g = ((a >>> 8) & 0xff) * u + ((b >>> 8) & 0xff) * t;
  const bl = ((a >>> 16) & 0xff) * u + ((b >>> 16) & 0xff) * t;
  return (0xff000000 | (bl << 16) | (g << 8) | r) >>> 0;
}

export class Surface {
  w = 0;
  h = 0;
  px = new Uint32Array(0);
  bytes: Buffer = Buffer.alloc(0);

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const ab = new ArrayBuffer(w * h * 4);
    this.px = new Uint32Array(ab);
    this.bytes = Buffer.from(ab);
  }

  clear(c: number): void {
    this.px.fill(c);
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    let x0 = Math.round(x), y0 = Math.round(y);
    let x1 = Math.round(x + w), y1 = Math.round(y + h);
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > this.w) x1 = this.w;
    if (y1 > this.h) y1 = this.h;
    if (x1 <= x0) return;
    for (let yy = y0; yy < y1; yy++) this.px.fill(c, yy * this.w + x0, yy * this.w + x1);
  }

  /** Rectangle outline of thickness t, drawn inside the given bounds. */
  frame(x: number, y: number, w: number, h: number, t: number, c: number): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y + t, t, h - 2 * t, c);
    this.rect(x + w - t, y + t, t, h - 2 * t, c);
  }

  /** Blend a colour over a rectangle; alpha 0..1. */
  shade(x: number, y: number, w: number, h: number, c: number, alpha: number): void {
    let x0 = Math.round(x), y0 = Math.round(y);
    let x1 = Math.round(x + w), y1 = Math.round(y + h);
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > this.w) x1 = this.w;
    if (y1 > this.h) y1 = this.h;
    const a = Math.round(alpha * 256), u = 256 - a;
    const cr = (c & 0xff) * a, cg = ((c >>> 8) & 0xff) * a, cb = ((c >>> 16) & 0xff) * a;
    const px = this.px;
    for (let yy = y0; yy < y1; yy++) {
      for (let i = yy * this.w + x0, end = yy * this.w + x1; i < end; i++) {
        const d = px[i];
        px[i] = (0xff000000
          | ((((d >>> 16) & 0xff) * u + cb) >> 8 << 16)
          | ((((d >>> 8) & 0xff) * u + cg) >> 8 << 8)
          | (((d & 0xff) * u + cr) >> 8)) >>> 0;
      }
    }
  }

  textWidth(s: string, scale: number): number {
    return s.length ? (s.length * CHAR_W - 1) * scale : 0;
  }

  /** Draw text; align -1 left of x, 0 centred on x, 1 right-aligned to x. */
  text(s: string, x: number, y: number, scale: number, c: number, align = -1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (align === 0) x -= this.textWidth(s, scale) >> 1;
    else if (align === 1) x -= this.textWidth(s, scale);
    for (let i = 0; i < s.length; i++) {
      let code = s.charCodeAt(i);
      if (code >= 97 && code <= 122) code -= 32;
      const g = GLYPHS.get(code);
      if (g) {
        for (let r = 0; r < CHAR_H; r++) {
          const bits = g[r];
          if (!bits) continue;
          // Merge horizontal runs so each row costs one or two fills.
          for (let b = 0; b < 5; b++) {
            if (!(bits & (16 >> b))) continue;
            let run = 1;
            while (b + run < 5 && bits & (16 >> (b + run))) run++;
            this.rect(x + b * scale, y + r * scale, run * scale, scale, c);
            b += run;
          }
        }
      }
      x += CHAR_W * scale;
    }
  }
}

/** Greedy word wrap for the fixed-width font. */
export function wrap(s: string, maxChars: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    if (line && line.length + 1 + word.length > maxChars) {
      out.push(line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) out.push(line);
  return out;
}
