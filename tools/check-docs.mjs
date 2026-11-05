// Keeps docs from going stale, with no AI involved:
//   node tools/check-docs.mjs                     API table matches the firmware, and links work
//   node tools/check-docs.mjs --commit-msg FILE   also: changed code must come with its docs (the git hook)
//   node tools/check-docs.mjs --range A..B        the same, for a pull request (CI)
// A commit that really needs no doc change says so with a "Docs-Checked: <reason>" line.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function routesInCode(cpp) {
  return [...cpp.matchAll(/server\.on\("([^"]+)"(?:,\s*HTTP_(\w+))?/g)].map((m) => `${m[2] ?? 'GET'} ${m[1]}`);
}

export function routesInDocs(md) {
  return [...md.matchAll(/^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`?]+)[^`]*` \|/gm)].map((m) => `${m[1]} ${m[2]}`);
}

export function routeProblems(code, docs) {
  return [
    ...code.filter((r) => !docs.includes(r)).map((r) => `docs/api.md is missing ${r}`),
    ...docs.filter((r) => !code.includes(r)).map((r) => `docs/api.md lists ${r}, which isn't in the firmware`),
  ];
}

export function slug(heading) {
  return heading.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');
}

// file -> its text. Returns problems with relative links and #anchors between markdown files.
export function linkProblems(files, exists) {
  const problems = [];
  const anchors = (text) => [...text.replace(/```[\s\S]*?```/g, '').matchAll(/^#+\s+(.+)$/gm)].map((m) => slug(m[1]));
  for (const [file, raw] of Object.entries(files)) {
    const text = raw.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`(?!\])/g, '');
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(target)) continue;
      const [path, anchor] = target.split('#');
      const rel = path ? resolve('/', dirname(file), path).replace(/^.*?[\\/]/, '').replace(/\\/g, '/') : file;
      if (path && !exists(rel)) problems.push(`${file}: broken link to ${target}`);
      else if (anchor && files[rel] && !anchors(files[rel]).includes(anchor)) problems.push(`${file}: broken anchor in ${target}`);
    }
  }
  return problems;
}

// Each rule: if a changed file is under `paths`, one of its `docs` must have changed too.
export function staleDocs(changed, map) {
  const under = (file, path) => (path.endsWith('/') ? file.startsWith(path) : file === path);
  const code = changed.filter((f) => !map.ignore.includes(f));
  return map.rules
    .map((rule) => ({ files: code.filter((f) => rule.paths.some((p) => under(f, p))), docs: rule.docs }))
    .filter((r) => r.files.length && !r.docs.some((d) => changed.includes(d)));
}

export const hasDocsChecked = (message) => /^Docs-Checked:\s*\S/m.test(message);

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
}

function main() {
  const [mode, value] = process.argv.slice(2);
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const markdown = Object.fromEntries(git('ls-files', '*.md').map((f) => [f, read(f)]));
  const problems = [
    ...routeProblems(routesInCode(read('firmware/src/main.cpp')), routesInDocs(read('docs/api.md'))),
    ...linkProblems(markdown, (f) => existsSync(join(root, f))),
  ];

  let changed = null, message = '';
  if (mode === '--commit-msg') {
    changed = git('diff', '--cached', '--name-only');
    message = readFileSync(value, 'utf8');
  } else if (mode === '--range') {
    changed = git('diff', '--name-only', value);
    message = git('log', '--format=%B', value).join('\n');
  }
  if (changed && !hasDocsChecked(message)) {
    for (const { files, docs } of staleDocs(changed, JSON.parse(read('tools/docs-map.json')))) {
      problems.push(`${files.join(', ')} changed, but none of these did: ${docs.join(', ')}`);
    }
  }

  if (problems.length) {
    console.error('Docs may be stale:\n' + problems.map((p) => `  - ${p}`).join('\n'));
    console.error('\nUpdate the docs. If none need changing, add a line to the commit message: Docs-Checked: <reason>');
    process.exit(1);
  }
  console.log('Docs check passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
