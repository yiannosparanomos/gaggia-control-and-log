import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasDocsChecked, linkProblems, routeProblems, routesInCode, routesInDocs, slug, staleDocs } from './check-docs.mjs';

test('reads routes from the firmware', () => {
  const cpp = 'server.on("/", handleRoot);\n  server.on("/api/start", HTTP_POST, handleStart);';
  assert.deepEqual(routesInCode(cpp), ['GET /', 'POST /api/start']);
});

test('reads routes from the docs table, ignoring query strings', () => {
  const md = '| GET | `/` | the app |\n| POST | `/api/set?limit=30` | settings |\n| Field | Meaning |';
  assert.deepEqual(routesInDocs(md), ['GET /', 'POST /api/set']);
});

test('finds routes missing from either side', () => {
  assert.deepEqual(routeProblems(['GET /a', 'POST /b'], ['GET /a', 'GET /c']), [
    'docs/api.md is missing POST /b',
    "docs/api.md lists GET /c, which isn't in the firmware",
  ]);
});

test('makes GitHub-style anchors', () => {
  assert.equal(slug('The repair: on/off button stopped working'), 'the-repair-onoff-button-stopped-working');
  assert.equal(slug("The ESP32 can't see the machine"), 'the-esp32-cant-see-the-machine');
  assert.equal(slug('1. Context'), '1-context');
});

test('finds broken links and anchors, and ignores code and URLs', () => {
  const files = {
    'README.md': '[a](docs/x.md#good) [b](docs/x.md#bad) [c](docs/gone.md) [d](https://e.com) `[e](nope.md)`',
    'docs/x.md': '# Good\n```\n# Fake\n```\n[back](../README.md) [self](#good)',
  };
  const exists = (f) => f in files;
  assert.deepEqual(linkProblems(files, exists), ['README.md: broken anchor in docs/x.md#bad', 'README.md: broken link to docs/gone.md']);
});

const map = {
  ignore: ['firmware/src/web_assets.h'],
  rules: [
    { paths: ['firmware/src/'], docs: ['docs/api.md', 'docs/architecture.md'] },
    { paths: ['web/package.json'], docs: ['docs/development.md'] },
  ],
};

test('code changed without its docs is flagged', () => {
  const stale = staleDocs(['firmware/src/main.cpp'], map);
  assert.equal(stale.length, 1);
  assert.deepEqual(stale[0].files, ['firmware/src/main.cpp']);
});

test('any one of the listed docs is enough', () => {
  assert.deepEqual(staleDocs(['firmware/src/main.cpp', 'docs/architecture.md'], map), []);
});

test('ignored and unmapped files need no docs', () => {
  assert.deepEqual(staleDocs(['firmware/src/web_assets.h', 'web/src/style.css'], map), []);
});

test('an exact path does not match by prefix', () => {
  assert.deepEqual(staleDocs(['web/package.json.bak'], map), []);
  assert.equal(staleDocs(['web/package.json'], map).length, 1);
});

test('Docs-Checked needs a reason', () => {
  assert.equal(hasDocsChecked('Fix typo\n\nDocs-Checked: comment only'), true);
  assert.equal(hasDocsChecked('Fix typo\n\nDocs-Checked:'), false);
  assert.equal(hasDocsChecked('Fix typo'), false);
});
