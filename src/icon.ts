// Loads assets/icon.png for the window icon. A small PNG reader (8-bit RGB or
// RGBA, non-interlaced) so the game needs no image library.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export interface Icon {
  width: number;
  height: number;
  /** RGBA bytes, row by row. */
  pixels: Buffer;
}

export function loadIcon(path: string): Icon | null {
  let file: Buffer;
  try {
    file = readFileSync(path);
  } catch {
    return null; // no icon supplied
  }
  try {
    if (file.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG file');
    let width = 0, height = 0, channels = 0;
    const data: Buffer[] = [];
    for (let at = 8; at < file.length;) {
      const len = file.readUInt32BE(at);
      const type = file.toString('latin1', at + 4, at + 8);
      const body = file.subarray(at + 8, at + 8 + len);
      if (type === 'IHDR') {
        width = body.readUInt32BE(0);
        height = body.readUInt32BE(4);
        const colour = body[9];
        if (body[8] !== 8 || (colour !== 2 && colour !== 6) || body[12] !== 0) {
          throw new Error('save it as an 8-bit RGB or RGBA PNG without interlacing');
        }
        channels = colour === 6 ? 4 : 3;
      } else if (type === 'IDAT') {
        data.push(body);
      }
      at += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(data));
    const stride = width * channels;
    const rows = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      const src = y * (stride + 1) + 1;
      const dst = y * stride;
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? rows[dst + i - channels] : 0;
        const b = y ? rows[dst + i - stride] : 0;
        const c = y && i >= channels ? rows[dst + i - stride - channels] : 0;
        let pred = 0;
        if (filter === 1) pred = a;
        else if (filter === 2) pred = b;
        else if (filter === 3) pred = (a + b) >> 1;
        else if (filter === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        rows[dst + i] = (raw[src + i] + pred) & 0xff;
      }
    }
    if (channels === 4) return { width, height, pixels: rows };
    const pixels = Buffer.alloc(width * height * 4, 255);
    for (let i = 0, n = width * height; i < n; i++) rows.copy(pixels, i * 4, i * 3, i * 3 + 3);
    return { width, height, pixels };
  } catch (e) {
    console.error(`tessera: could not use ${path}: ${(e as Error).message}`);
    return null;
  }
}
