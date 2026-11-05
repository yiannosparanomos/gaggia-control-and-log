// Tests flash.mjs's safety checks against a fake ESP32. --dry-run stops before any build or upload.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const flash = join(import.meta.dirname, 'flash.mjs');

async function runFlash(routes, args = ['--dry-run']) {
  const server = http.createServer((req, res) => {
    const body = routes[req.url];
    res.statusCode = body === undefined ? 404 : 200;
    res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const backups = mkdtempSync(join(tmpdir(), 'gaggia-flash-'));
  const env = { ...process.env, ESP: `http://127.0.0.1:${server.address().port}`, GAGGIA_BACKUP_DIR: backups };
  const child = spawn(process.execPath, [flash, ...args], { env });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const code = await new Promise((resolve) => child.on('close', resolve));
  server.close();
  return { code, output, files: readdirSync(backups).map((f) => join(backups, f)) };
}

const idle = { state: 'idle' };
const backup = { version: 1, brews: [{ id: 1 }, { id: 2 }], coffees: [{ id: 3 }] };

test('saves a backup from current firmware', async () => {
  const r = await runFlash({ '/api/status': idle, '/api/backup': backup });
  assert.equal(r.code, 0, r.output);
  assert.deepEqual(JSON.parse(readFileSync(r.files[0], 'utf8')), backup);
});

test('saves a backup from firmware with the old routes', async () => {
  const r = await runFlash({ '/status': idle, '/backup': backup });
  assert.equal(r.code, 0, r.output);
  assert.equal(r.files.length, 1);
});

test('refuses while a shot is running', async () => {
  const r = await runFlash({ '/api/status': { state: 'brewing' }, '/api/backup': backup });
  assert.equal(r.code, 1);
  assert.match(r.output, /A shot is running/);
  assert.equal(r.files.length, 0);
});

test('refuses when the backup is not valid', async () => {
  const r = await runFlash({ '/api/status': idle, '/api/backup': { version: 1 } });
  assert.equal(r.code, 1);
  assert.match(r.output, /not valid/);
  assert.equal(r.files.length, 0);
});

test('refuses when there is no backup route', async () => {
  const r = await runFlash({ '/api/status': idle });
  assert.equal(r.code, 1);
  assert.equal(r.files.length, 0);
});

test('old firmware can only be flashed with the cable', async () => {
  const r = await runFlash({ '/status': idle, '/backup': backup }, []);
  assert.equal(r.code, 1);
  assert.match(r.output, /--usb/);
  assert.equal(r.files.length, 0);
});

test('refuses when the ESP32 is unreachable', async () => {
  const child = spawn(process.execPath, [flash, '--dry-run'], { env: { ...process.env, ESP: 'http://127.0.0.1:9' } });
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 1);
});
