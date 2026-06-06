#!/usr/bin/env node
/**
 * Optimize public/og-image.png for social sharing previews.
 *
 * The source export can be several MB, which social platforms (WhatsApp,
 * Twitter/X, Facebook, LinkedIn) refuse or truncate. This script caps the
 * largest side at 1200px (keeping the original aspect ratio) and recompresses
 * it to a lightweight PNG.
 *
 * Uses ffmpeg (already available on this machine) instead of sharp, so there
 * is nothing extra to install.
 *
 * Usage:
 *   node scripts/optimize-og-image.mjs [input] [output] [maxSide]
 *   node scripts/optimize-og-image.mjs                       # defaults below
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

const input = resolve(process.argv[2] ?? 'public/og-image.png');
const output = resolve(process.argv[3] ?? 'public/og-image.png');
const maxSide = Number(process.argv[4] ?? 1200);

const before = statSync(input).size;

// Downscale so the longest side is at most `maxSide`, preserving aspect ratio,
// then quantize to a 256-colour palette. The artwork is a flat-background logo
// with few colours, so a palette PNG is visually identical but far smaller.
const scale =
  `scale='if(gt(iw,ih),min(${maxSide},iw),-1)':'if(gt(iw,ih),-1,min(${maxSide},ih))'`;
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i', input,
    '-vf',
    `${scale},split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=sierra2_4a`,
    '-update', '1', '-frames:v', '1',
    '-compression_level', '100',
    output,
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);

const after = statSync(output).size;
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
console.log(`og-image: ${kb(before)} -> ${kb(after)} (max side ${maxSide}px)`);
