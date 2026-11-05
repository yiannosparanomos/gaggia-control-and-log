// `npm run flash` in web/: back up the journal, build, upload, then confirm the journal survived.
//   npm run flash                 over WiFi
//   npm run flash -- --usb        over the USB cable (needed once, for firmware without WiFi updates)
//   npm run flash -- --dry-run    only the safety checks and the backup
// ESP=http://x.x.x.x picks another address. It never erases flash or uploads a filesystem.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pio } from './pio.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const host = (process.env.ESP || 'http://192.168.2.6').replace(/\/$/, '');
const backupDir = process.env.GAGGIA_BACKUP_DIR || join(root, 'backups');
const usb = process.argv.includes('--usb');
const dryRun = process.argv.includes('--dry-run');

function stop(message) {
  console.error(`\nNothing was uploaded. ${message}`);
  process.exit(1);
}

async function getJson(path, timeoutMs = 15000) {
  const r = await fetch(host + path, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) return null;
  return r.json();
}

// Firmware older than the /api routes serves the same data without the prefix.
async function getEither(path) {
  const current = await getJson('/api' + path);
  return current ? { data: current, oldFirmware: false } : { data: await getJson(path), oldFirmware: true };
}

let status;
try {
  status = await getEither('/status');
} catch (e) {
  stop(`Can't reach the ESP32 at ${host}, so the journal can't be backed up first. (${e.message})`);
}
if (!status.data) stop(`${host} didn't return a status.`);
if (status.data.state === 'brewing') stop('A shot is running.');
if (status.oldFirmware && !usb && !dryRun) stop('This firmware has no WiFi updates yet. Connect the cable and run: npm run flash -- --usb');

let backup;
try {
  backup = (await getEither('/backup')).data;
} catch (e) {
  stop(`The backup failed. (${e.message})`);
}
if (!Array.isArray(backup?.brews) || !Array.isArray(backup?.coffees)) stop('The backup was not valid.');

mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join(backupDir, `gaggia-${stamp}.json`);
writeFileSync(file, JSON.stringify(backup));
console.log(`Backed up ${backup.brews.length} brews and ${backup.coffees.length} coffees to ${file}`);

if (dryRun) {
  console.log('Dry run: stopping before the build and upload.');
  process.exit(0);
}

const build = spawnSync('npm', ['run', 'build'], { cwd: join(root, 'web'), stdio: 'inherit', shell: process.platform === 'win32' });
if (build.status !== 0) stop('The UI build failed.');

// Compiling takes a while, and a shot could start meanwhile. A USB upload resets the ESP32, which would
// leave the pump running with no stops, so compile first and check again just before uploading.
const buildArgs = usb ? ['run'] : ['run', '-e', 'esp32dev_ota', '--upload-port', new URL(host).hostname];
if (!pio(buildArgs, join(root, 'firmware'))) stop(`The firmware did not compile. Your backup is at ${file}`);
try {
  const again = await getEither('/status');
  if (again.data?.state !== 'idle' && again.data?.state !== 'done') stop(`Can't confirm the ESP32 is free. Your backup is at ${file}`);
} catch (e) {
  stop(`Can't confirm the ESP32 is free. (${e.message}) Your backup is at ${file}`);
}

if (usb) console.log('\nIf it hangs at "Connecting...", hold the BOOT button until the upload starts.');
const args = usb
  ? ['run', '-t', 'upload']
  : ['run', '-e', 'esp32dev_ota', '-t', 'upload', '--upload-port', new URL(host).hostname];
if (!pio(args, join(root, 'firmware'))) stop(`The upload failed. Your backup is at ${file}`);

// The new firmware always has /api routes. Give it time to reboot and rejoin WiFi.
console.log('\nUploaded. Waiting for the ESP32 to restart...');
for (let i = 0; i < 30; i++) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  try {
    const brews = await getJson('/api/brews', 5000);
    if (!Array.isArray(brews)) continue;
    if (brews.length !== backup.brews.length) {
      console.error(`WARNING: the journal now has ${brews.length} brews, and the backup has ${backup.brews.length}. Your backup is at ${file}`);
      process.exit(1);
    }
    console.log(`Done. The journal still has all ${brews.length} brews.`);
    process.exit(0);
  } catch {
    // still restarting
  }
}
console.error(`WARNING: the ESP32 didn't come back within a minute. Check the serial monitor. Your backup is at ${file}`);
process.exit(1);
