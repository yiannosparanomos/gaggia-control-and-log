import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockReason } from '../.claude/hooks/guard.mjs';

const BLOCKED = [
  'pio run -t uploadfs',
  'pio run -t erase',
  'cd firmware && pio run --target erase',
  'pio run -e esp32dev -t erase_upload',
  '"C:\\Users\\x\\.platformio\\penv\\Scripts\\pio.exe" run -t uploadfs',
  'python -m esptool erase_flash',
  'esptool.py --port COM7 erase-flash',
  'git add firmware/src/secrets.h',
  'git add CLAUDE.local.md',
  'git add backups/gaggia.json',
  'git add -f web/dist',
  'git add --force .',
  'git commit --no-verify -m "x"',
  'git commit -n -m "x"',
  'git push --no-verify',
];

const ALLOWED = [
  'pio run',
  'pio run -t upload',
  'pio run -e esp32dev_ota -t upload --upload-port 192.168.2.6',
  'pio test -e native',
  'npm run flash -- --usb',
  'git add -A',
  'git add firmware/src/secrets.example.h',
  'git commit -m "Update docs"',
  'git status',
  'git log -n 5',
];

for (const command of BLOCKED) {
  test(`blocks: ${command}`, () => assert.ok(blockReason(command)));
}
for (const command of ALLOWED) {
  test(`allows: ${command}`, () => assert.equal(blockReason(command), null));
}
