// Turns TextKeys like `story:spirit_guide.fragment_1` into words from content/*.json.
import story from '../../content/story.json';
import npcs from '../../content/npcs.json';
import type { TextKey } from '../contracts';

const files: Record<string, unknown> = { story, npcs };

export function lookup(key: TextKey): unknown {
  const [file, path = ''] = key.split(':');
  let node: unknown = files[file];
  for (const part of path.split('.').filter(Boolean)) {
    if (node && typeof node === 'object') node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return node;
}

/** The text for a key. Missing text shows the key itself, so gaps are easy to spot in playtests. */
export function t(key: TextKey): string {
  const v = lookup(key);
  return typeof v === 'string' ? v : `[${key}]`;
}

export function list(key: TextKey): string[] {
  const v = lookup(key);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
