// fix-rotation.js — rotate one or more images in-place
// Usage: node fix-rotation.js <degrees> <file1> [file2] ...
// Example: node fix-rotation.js 90 "images/speakers/foo.webp" "images/speakers/bar.webp"

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const [degrees, ...files] = process.argv.slice(2);

if (!degrees || files.length === 0) {
  console.log('Usage: node fix-rotation.js <degrees> <file1> [file2] ...');
  console.log('Example: node fix-rotation.js -90 "images/speakers/foo.webp"');
  process.exit(1);
}

Promise.all(files.map(async file => {
  const buffer = await sharp(file).rotate(Number(degrees)).toBuffer();
  fs.writeFileSync(file, buffer);
  console.log(`✓ ${path.basename(file)} (rotated ${degrees}°)`);
})).then(() => console.log('Done.'));
