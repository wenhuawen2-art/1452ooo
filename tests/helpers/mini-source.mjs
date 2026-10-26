import { readFile } from 'node:fs/promises';
import path from 'node:path';
export async function readMini(file, encoding) {
  let source = await readFile(file, encoding);
  if (typeof source !== 'string') return source;
  const pattern = String(file).endsWith('.wxml') ? /<include src="([^"]+)"\s*\/>/g : String(file).endsWith('.wxss') ? /@import\s+["']([^"']+)["'];/g : null;
  if (!pattern) return source;
  const matches = [...source.matchAll(pattern)];
  for (const match of matches) source = source.replace(match[0], await readMini(path.resolve(path.dirname(file), match[1]), encoding));
  return source;
}
