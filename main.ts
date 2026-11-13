// ai-happy-01 entry: "The Bubble That Caught a Rainbow"
//
// A golden retriever puppy, mid-leap in a sunflower meadow at golden hour,
// reaches for one giant soap bubble — and inside the bubble ride a tiny
// rainbow and a small smiling sun. One specific, warm moment of joy:
// the picture this program enters in make.fun's "Make the AI judge happy"
// bounty. The artwork ships beside this file as entry.png; the program
// checks it against the competition gate and writes it, byte for byte,
// to the output directory as entry.png.
//
// The gate (from the kit's RULES.txt): a whole PNG or JPEG, told apart by
// its first bytes, at most 1 MiB (1048576 bytes) and at most 1024 by 1024
// pixels. The judge sees exactly the bytes written, and the program runs
// twice with both runs writing the same bytes, so the write is a pure
// copy of the shipped file — no clocks, no randomness, no network.
//
// Run it the way the rules describe:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader's container MAKEFUN_OUTPUT_DIR is unset and the output
// directory is /output. Node 22, standard library only.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1048576; // 1 MiB, the gate's size cap
const MAX_WIDTH = 1024; // the gate's width cap, pixels
const MAX_HEIGHT = 1024; // the gate's height cap, pixels

const PNG_MAGIC: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC: readonly number[] = [0xff, 0xd8, 0xff];

type PictureKind = 'png' | 'jpeg';

interface PictureInfo {
  kind: PictureKind;
  bytes: number;
  width: number;
  height: number;
}

// Resolve where this program's own files live, so the picture is found
// beside main.ts whether the repo sits at /bot (the grader) or anywhere
// else (a local checkout).
function here(): string {
  return dirname(fileURLToPath(import.meta.url));
}

// The output directory: MAKEFUN_OUTPUT_DIR when set (local runs), else
// /output (the grader's writable directory).
function outputDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

function hasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((byte, i) => bytes[i] === byte);
}

// A PNG carries its dimensions in the IHDR chunk right after the 8-byte
// signature: width and height as big-endian uint32 at offsets 16 and 20.
function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// A JPEG is a walk of marker segments: each starts 0xFF, a marker byte,
// and (for the segments that carry data) a big-endian uint16 length that
// includes its own two bytes. The frame header (SOF0 0xC0, SOF2 0xC2)
// holds the picture's height and width as uint16s after one precision
// byte. Walk the segments until the frame header turns up.
function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2; // skip the SOI marker (FF D8) the magic check already saw
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      return { width, height };
    }
    // Standalone markers (TEM, RST0-7, SOI) carry no length; every other
    // segment steps over by its declared length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
    } else {
      offset += 2 + view.getUint16(offset + 2);
    }
  }
  throw new Error('entry.png: no JPEG frame header found');
}

// Inspect the picture and report what the gate would see. Throws with a
// plain message on anything the gate would refuse, so a bad file fails
// loudly here instead of silently scoring 0 before the judge.
function inspectPicture(bytes: Uint8Array): PictureInfo {
  if (bytes.length === 0) throw new Error('entry.png is empty');
  if (bytes.length > MAX_BYTES) {
    throw new Error(`entry.png is ${bytes.length} bytes, over the ${MAX_BYTES}-byte cap`);
  }
  if (hasMagic(bytes, PNG_MAGIC)) {
    const { width, height } = pngDimensions(bytes);
    return { kind: 'png', bytes: bytes.length, width, height };
  }
  if (hasMagic(bytes, JPEG_MAGIC)) {
    const { width, height } = jpegDimensions(bytes);
    return { kind: 'jpeg', bytes: bytes.length, width, height };
  }
  throw new Error('entry.png is neither a PNG nor a JPEG (bad magic bytes)');
}

function main(): void {
  const source = join(here(), 'entry.png');
  const bytes = readFileSync(source);
  const info = inspectPicture(bytes);
  if (info.width > MAX_WIDTH || info.height > MAX_HEIGHT) {
    throw new Error(`entry.png is ${info.width}x${info.height}, over the ${MAX_WIDTH}x${MAX_HEIGHT} cap`);
  }
  const dir = outputDir();
  mkdirSync(dir, { recursive: true });
  const target = join(dir, 'entry.png');
  writeFileSync(target, bytes);
  // The program runs twice and both runs must write the same bytes, and
  // the judge sees exactly the bytes in the file: prove the copy landed
  // identical to the shipped picture before claiming success.
  const written = readFileSync(target);
  const digest = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
  if (written.length !== bytes.length || digest(written) !== digest(bytes)) {
    throw new Error('the written entry.png differs from the shipped picture');
  }
  console.log(
    `wrote ${target}: ${info.kind}, ${info.bytes} bytes, ${info.width}x${info.height}, sha256 ${digest(bytes)}`,
  );
}

main();
