import sharp from 'sharp';
import { readdir, writeFile } from 'fs/promises';
import { statSync } from 'fs';
import path from 'path';

const INPUT_DIR = 'public/images/italy';
const QUALITY = 80;
const MAX_WIDTH = 1200;

const files = await readdir(INPUT_DIR);
const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

console.log(`Trovate ${imageFiles.length} immagini da convertire...`);

const converted = [];

for (const file of imageFiles) {
  const inputPath = path.join(INPUT_DIR, file);
  const baseName = path.parse(file).name;
  const outputPath = path.join(INPUT_DIR, `${baseName}.webp`);

  const sizeBefore = statSync(inputPath).size;

  await sharp(inputPath)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outputPath);

  const sizeAfter = statSync(outputPath).size;
  const reduction = Math.round((1 - sizeAfter / sizeBefore) * 100);
  console.log(`  ${file} → ${baseName}.webp  (${Math.round(sizeBefore/1024)}KB → ${Math.round(sizeAfter/1024)}KB, -${reduction}%)`);
  converted.push(`${baseName}.webp`);
}

await writeFile(path.join(INPUT_DIR, 'manifest.json'), JSON.stringify(converted, null, 2));
console.log(`\nManifest aggiornato con ${converted.length} file .webp`);
