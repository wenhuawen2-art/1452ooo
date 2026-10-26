// A seamless, single-contour side-view running illustration. The original sprite
// remains in the project as a hidden legacy version.
const fs = require('node:fs');
const path = require('node:path');

const frames = 24;
const width = 104;
const height = 112;
const round = value => Number(value.toFixed(2));

function pose(index) {
  const phase = index / frames * Math.PI * 2;
  const stride = Math.sin(phase);
  const swing = Math.cos(phase);
  const bob = round(2 * Math.cos(phase * 2));
  const y = value => round(value + bob);
  const rightArm = round(5 * swing);
  const leftArm = round(-3 * swing);
  const legs = [
    { x: round(55 + 20 * stride), y: round(98 - 15 * Math.max(0, swing)) },
    { x: round(55 - 20 * stride), y: round(98 - 15 * Math.max(0, -swing)) }
  ].sort((a, b) => a.x - b.x);
  const [left, right] = legs;
  const gap = right.x - left.x;
  // Keep the feet legible when the strides pass through the center. This also
  // prevents the outline from folding into an apparent internal knee joint.
  const l = round(left.x - Math.max(0, 14 - gap / 2));
  const r = round(right.x + Math.max(0, 14 - gap / 2));

  // One uninterrupted outer contour includes the head, arms, coat and legs.
  // There are no circles, hinges, or limb paths drawn inside the body.
  const body = [
    `M 49 ${y(34)}`,
    `C 47 ${y(31)} 45 ${y(27)} 45 ${y(22)}`,
    `C 44 ${y(15)} 49 ${y(10)} 56 ${y(10)}`,
    `C 62 ${y(10)} 66 ${y(13)} 67 ${y(17)}`,
    `Q 70 ${y(18)} 73 ${y(18)}`,
    `Q 74 ${y(20)} 69 ${y(21)}`,
    `Q 72 ${y(23)} 70 ${y(25)}`,
    `Q 68 ${y(30)} 61 ${y(31)}`,
    `L 61 ${y(34)}`,
    `C 68 ${y(35)} 70 ${y(38)} 71 ${y(42)}`,
    `L ${round(77 + rightArm)} ${y(47)}`,
    `Q ${round(80 + rightArm)} ${y(50)} ${round(77 + rightArm)} ${y(53)}`,
    `Q ${round(74 + rightArm)} ${y(55)} ${round(72 + rightArm)} ${y(52)}`,
    `L ${round(66 + rightArm * .35)} ${y(48)}`,
    `Q 67 ${y(56)} 64 ${y(65)}`,
    `Q ${round(63 + (r - 56) * .36)} ${y(74)} ${round(r + 2)} ${y(84)}`,
    `L ${round(r + 3)} ${right.y - 4}`,
    `Q ${round(r + 8)} ${right.y - 3} ${round(r + 10)} ${right.y}`,
    `Q ${round(r + 11)} ${right.y + 3} ${round(r + 7)} ${right.y + 3}`,
    `L ${round(r - 3)} ${right.y + 3}`,
    `Q ${round(r - 7)} ${right.y + 2} ${round(r - 7)} ${right.y - 2}`,
    `Q ${round(r - 6)} ${y(86)} 55 ${y(74)}`,
    `Q ${round(l + 6)} ${y(86)} ${round(l + 6)} ${left.y - 2}`,
    `Q ${round(l + 6)} ${left.y + 2} ${round(l + 2)} ${left.y + 3}`,
    `L ${round(l - 8)} ${left.y + 3}`,
    `Q ${round(l - 12)} ${left.y + 3} ${round(l - 11)} ${left.y}`,
    `Q ${round(l - 9)} ${left.y - 3} ${round(l - 4)} ${left.y - 4}`,
    `L ${round(l - 3)} ${y(84)}`,
    `Q ${round(45 + (l - 55) * .35)} ${y(74)} 45 ${y(65)}`,
    `Q 43 ${y(57)} 45 ${y(47)}`,
    `L ${round(43 + leftArm * .35)} ${y(51)}`,
    `Q ${round(42 + leftArm)} ${y(54)} ${round(40 + leftArm)} ${y(51)}`,
    `Q ${round(39 + leftArm)} ${y(49)} ${round(42 + leftArm)} ${y(46)}`,
    `Q ${round(43 + leftArm)} ${y(43)} 44 ${y(40)}`,
    `C 43 ${y(37)} 46 ${y(35)} 49 ${y(34)}`,
    'Z'
  ].join(' ');

  const ground = [0, 1, 2].map(n => {
    const travel = (index / frames + n / 3) % 1;
    const x = round(85 - travel * 76);
    const opacity = round(.2 + .58 * Math.sin(travel * Math.PI));
    return `<path opacity="${opacity}" d="M ${x} ${105 + n * 2} q 6 -2 13 -1"/>`;
  }).join('');

  return `<g fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${body}" fill="#ffffff12"/><path d="M 49 ${y(17)} Q 57 ${y(12)} 66 ${y(16)}"/><path d="M 65 ${y(22)} h 1"/><path opacity=".72" d="M 48 ${y(32)} Q 40 ${y(28)} 31 ${y(31)}"/>${ground}</g>`;
}

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * (frames + 1)}" height="${height}" viewBox="0 0 ${width * (frames + 1)} ${height}">${Array.from({ length: frames + 1 }, (_, i) => `<g transform="translate(${i * width} 0)">${pose(i % frames)}</g>`).join('')}</svg>`;
const destination = path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram', 'assets', 'loading-welcome', 'walker-sprite.svg');
svg = svg.replaceAll('<g fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">', '<g>').replace('<svg ', '<svg fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ');
svg = svg.replace(/d="([^"]*)"/g, (_, d) => 'd="' + d.replace(/\s*([a-zA-Z])\s*/g, '$1') + '"');
fs.writeFileSync(destination, svg);
const sampleDir = path.join(__dirname, '..', 'output', 'walker');
fs.mkdirSync(sampleDir, { recursive: true });
for (const i of [0, 3, 6, 9, 12, 15, 18, 21]) {
  fs.writeFileSync(path.join(sampleDir, `pose-${i}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${pose(i)}</svg>`);
}
console.log(JSON.stringify({ frames, width, height, bytes: Buffer.byteLength(svg), destination }));
