// Checks the Markdown documentation: every relative link and image points at a file that exists, every #anchor exists in its
// target, and nothing mentions a local path, the private working notes, or a leftover placeholder.
// Run from the project folder:  node scripts/check-docs.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['node_modules', 'out', 'dist', 'test-results', 'superpowers', 'portfolio', '.git']);

function markdownFiles(folder) {
  const found = [];
  for (const name of readdirSync(folder)) {
    if (skip.has(name)) continue;
    const full = join(folder, name);
    if (statSync(full).isDirectory()) found.push(...markdownFiles(full));
    else if (name.endsWith('.md')) found.push(full);
  }
  return found;
}

const slug = (heading) =>
  heading
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

function anchorsOf(file) {
  const anchors = new Set();
  let inFence = false;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = !inFence && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) anchors.add(slug(m[1]));
  }
  return anchors;
}

const problems = [];
const files = markdownFiles(root);
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const where = relative(root, file).replace(/\\/g, '/');
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');
  for (const match of withoutCode.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img[^>]*src="([^"]+)"/g)) {
    const target = (match[1] ?? match[2] ?? '').trim();
    if (target === '' || /^(https?:|mailto:|data:)/.test(target)) continue;
    const [pathPart, hash] = target.split('#');
    const targetFile = pathPart === '' ? file : resolve(dirname(file), decodeURIComponent(pathPart));
    if (!existsSync(targetFile)) {
      problems.push(`${where}: missing target ${target}`);
      continue;
    }
    if (hash && statSync(targetFile).isFile() && targetFile.endsWith('.md') && !anchorsOf(targetFile).has(hash.toLowerCase())) {
      problems.push(`${where}: no heading "#${hash}" in ${relative(root, targetFile).replace(/\\/g, '/')}`);
    }
  }
  for (const [pattern, why] of [
    [/C:\\Users\\|\/Users\/[a-z]+\/|antho\b|ai workspace/i, 'a local path or name'],
    [/superpowers/i, 'the private working notes'],
    [/\bTODO\b|\bTBD\b|lorem ipsum|XXX/, 'a placeholder'],
  ]) {
    if (pattern.test(withoutCode)) problems.push(`${where}: mentions ${why}`);
  }
}
console.log(`${files.length} Markdown files checked.`);
if (problems.length > 0) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('All links, images and anchors resolve; nothing private found.');
