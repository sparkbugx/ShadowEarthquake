#!/usr/bin/env node
/**
 * ShadowEarthquake — image pre-processor.
 *
 * Removes the original "ACTIONS / 1. ATTACK / 2. DEFEND / 3. REASON / 4. ESCAPE"
 * menu text from the 800x600 encounter artwork so the live Angular HUD can be
 * overlaid in exactly the same spot.
 *
 * Usage:
 *   node clean-image.mjs                 # default: solid #000000 rectangle (spec)
 *   node clean-image.mjs --inpaint       # erase only the text pixels and refill them
 *                                        # with the surrounding vest dithering
 *   node clean-image.mjs --input=path/to/raw.jpg --output=path/to/out.png
 *
 * Input resolution order: --input, ../raw-encounter.jpg, ../shadow.jpg
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

// Exact bounding box of the original text (800x600 reference).
const BOX = { left: 340, top: 335, width: 135, height: 145 };
const REF_W = 800;
const REF_H = 600;

const candidates = [args.input && resolve(process.cwd(), args.input), resolve(root, 'raw-encounter.jpg'), resolve(root, 'shadow.jpg')].filter(Boolean);
const input = candidates.find((p) => existsSync(p));
if (!input) {
  console.error(`[clean-image] Source artwork not found. Looked for:\n  ${candidates.join('\n  ')}`);
  process.exit(1);
}

const output = args.output
  ? resolve(process.cwd(), args.output)
  : resolve(root, 'frontend/public/assets/shadow-bg-clean.png');
mkdirSync(dirname(output), { recursive: true });

const meta = await sharp(input).metadata();
// Scale the box if the source is not exactly 800x600 (keeps the same % position).
const sx = meta.width / REF_W;
const sy = meta.height / REF_H;
const box = {
  left: Math.round(BOX.left * sx),
  top: Math.round(BOX.top * sy),
  width: Math.round(BOX.width * sx),
  height: Math.round(BOX.height * sy),
};

if (args.inpaint) {
  await inpaint(input, output, box);
} else {
  await sharp(input)
    .composite([
      {
        input: {
          create: { width: box.width, height: box.height, channels: 3, background: '#000000' },
        },
        left: box.left,
        top: box.top,
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(output);
}

console.log(`[clean-image] ${args.inpaint ? 'inpaint' : 'rect'} mode`);
console.log(`[clean-image] source: ${input} (${meta.width}x${meta.height})`);
console.log(`[clean-image] box:    left=${box.left} top=${box.top} width=${box.width} height=${box.height}`);
console.log(`[clean-image] wrote:  ${output}`);

/**
 * Text-aware erase: every bright pixel (the white/grey letters + underline) inside
 * the box, dilated by 1px to catch JPEG fringes, is replaced with the nearest
 * unmasked pixel in the same column. Vertical offsets are even so the 2x2
 * dither pattern stays in phase.
 */
async function inpaint(src, dst, b) {
  const THRESHOLD = 88; // vest dithering peaks around ~75; text is >= ~100
  const { data, info } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const mask = new Uint8Array(W * H);

  for (let y = b.top; y < b.top + b.height; y++) {
    for (let x = b.left; x < b.left + b.width; x++) {
      if (data[y * W + x] > THRESHOLD) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= 0 && yy < H && xx >= 0 && xx < W) mask[yy * W + xx] = 1;
          }
        }
      }
    }
  }

  const out = Buffer.from(data);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      let filled = false;
      for (let k = 2; k < 80 && !filled; k += 2) {
        for (const yy of [y - k, y + k]) {
          if (yy >= 0 && yy < H && !mask[yy * W + x]) {
            out[y * W + x] = data[yy * W + x];
            filled = true;
            break;
          }
        }
      }
      if (!filled) out[y * W + x] = 0;
    }
  }

  await sharp(out, { raw: { width: W, height: H, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(dst);
}
