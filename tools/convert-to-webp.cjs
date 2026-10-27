// convert-to-webp.js — batch convert images to WebP
// Usage: node convert-to-webp.js [folder] [quality]
// Default: folder = "images", quality = 82

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const folder  = process.argv[2] || 'images';
const quality = Number(process.argv[3]) || 82;
const exts    = ['.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp'];

const files = fs.readdirSync(folder).filter(f =>
  exts.includes(path.extname(f).toLowerCase())
);

if (files.length === 0) {
  console.log(`No images found in "${folder}"`);
  process.exit(0);
}

console.log(`Converting ${files.length} file(s) → WebP (quality ${quality})...\n`);

Promise.all(files.map(async file => {
  const input  = path.join(folder, file);
  const output = path.join(folder, path.basename(file, path.extname(file)) + '.webp');
  await sharp(input).webp({ quality }).toFile(output);
  const inSize  = (fs.statSync(input).size / 1024).toFixed(0);
  const outSize = (fs.statSync(output).size / 1024).toFixed(0);
  console.log(`✓ ${file} → ${path.basename(output)}  (${inSize}KB → ${outSize}KB)`);
})).then(() => {
  console.log('\nDone. Original files kept — delete manually if not needed.');
}).catch(err => {
  console.error('Error:', err.message);
});
