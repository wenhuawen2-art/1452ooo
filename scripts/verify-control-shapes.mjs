import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=process.argv[2]||'output/control-shapes-extended.log';
const raw=fs.readFileSync(source,'utf8');
assert.ok(raw.includes('### Result'),raw.slice(-1200));
const rows=JSON.parse(raw.split('### Result')[1].trim().split('\n')[0]);
// The decorative route arc is intentionally elliptical; it is not a control.
const errors=rows.flatMap(r=>r.circles.filter(c=>c.cls!=='route-line').map(c=>({scene:r.scene,width:r.width,...c})));
assert.deepEqual(errors,[],'Round controls must retain equal width and height');
assert.deepEqual(rows.filter(r=>r.overflow).map(r=>({scene:r.scene,width:r.width})),[],'No horizontal page overflow');
fs.writeFileSync('output/control-shapes-verified.json',JSON.stringify({checked:rows.length,widths:[...new Set(rows.map(r=>r.width))],roundControlErrors:errors.length,overflow:0,rows},null,2));
console.log(`PASS: ${rows.length} page/form/panel scenarios; no elliptical round controls or horizontal overflow.`);
