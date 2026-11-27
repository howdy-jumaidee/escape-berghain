// Fails the build if the code asks for a content key that doesn't exist.
// Finds literal keys like 'story:spirit_guide.mate' or `npcs:patrick.lines.0` in src/.
// Keys built with ${...} are checked up to the last whole segment before the placeholder.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = { story: JSON.parse(readFileSync('content/story.json', 'utf8')), npcs: JSON.parse(readFileSync('content/npcs.json', 'utf8')) };

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

function has(file, path) {
  let node = files[file];
  for (const part of path.split('.').filter(Boolean)) {
    if (node && typeof node === 'object' && part in node) node = node[part];
    else return false;
  }
  return true;
}

const missing = [];
let checked = 0;
for (const f of walk('src')) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/['`](story|npcs):([A-Za-z0-9_.${}]+)['`]/g)) {
    const [, file, raw] = m;
    // With a placeholder, check only the whole segments before it: `spirit_guide.fragment_${id}` checks `spirit_guide`.
    const head = raw.split('${');
    const path = head.length > 1 ? head[0].slice(0, head[0].lastIndexOf('.') + 1).replace(/\.$/, '') : raw;
    if (!path) continue;
    checked++;
    if (!has(file, path)) missing.push(`${f}: ${file}:${raw}`);
  }
}
if (missing.length) {
  console.error(`Missing content keys (${missing.length}). Add them to content/ or fix the code:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log(`content keys ok (${checked} checked)`);
