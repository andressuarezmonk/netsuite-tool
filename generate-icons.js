// Run with: node generate-icons.js
// Generates simple SVG-based PNG icons for the extension
// Requires: npm install canvas  (or just use any 16/48/128px PNG you like)

const { createCanvas } = require('canvas');
const fs = require('fs');

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.18);
  ctx.fill();

  // Clock circle
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = size * 0.07;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Clock hands
  ctx.strokeStyle = 'white';
  ctx.lineCap = 'round';
  ctx.lineWidth = size * 0.07;
  // Hour hand (pointing to ~10)
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - r * 0.4, cy - r * 0.5);
  ctx.stroke();
  // Minute hand (pointing to ~12)
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - r * 0.65);
  ctx.stroke();

  return canvas.toBuffer('image/png');
}

[16, 48, 128].forEach((size) => {
  fs.writeFileSync(`icons/icon${size}.png`, makeIcon(size));
  console.log(`Generated icon${size}.png`);
});
