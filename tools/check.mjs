// `npm run check` in web/: everything a change must pass. CI runs this same command.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasHostCompiler, pio } from './pio.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web');
const firmware = join(root, 'firmware');
const PAGE_GZ_LIMIT = 90 * 1024;
const FLASH_LIMIT = Math.floor(0x140000 * 0.97); // the app partition is 0x140000 bytes and can't grow

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' }).status === 0;
}

function fail(message) {
  throw new Error(message);
}

const steps = {
  'no private files tracked'() {
    const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.split('\n');
    const bad = tracked.filter((f) => /(^|\/)secrets\.h$|(^|\/)CLAUDE\.local\.md$|^backups\/|carezza-1996-schematic/.test(f));
    if (bad.length) fail(`These must not be in git: ${bad.join(', ')}`);
  },

  'build tool tests'() {
    if (!run('node', ['--test', '../tools/'], web)) fail('Build tool tests failed.');
  },

  'docs match the code'() {
    if (!run('node', ['../tools/check-docs.mjs'], web)) fail('The docs check failed.');
  },

  'UI builds, is up to date in the firmware, and fits'() {
    if (!run('npx', ['vite', 'build', '--logLevel', 'warn'], web)) fail('The UI build failed.');
    const header = readFileSync(join(firmware, 'src', 'web_assets.h'), 'utf8');
    const built = createHash('sha256').update(readFileSync(join(web, 'dist', 'index.html'))).digest('hex');
    if (!header.includes(`html sha256: ${built}`)) fail('firmware/src/web_assets.h is out of date. Run `npm run build` in web/.');
    const size = Number(/INDEX_HTML_GZ_LEN = (\d+)/.exec(header)[1]);
    console.log(`Page: ${(size / 1024).toFixed(1)} KB gzipped (limit ${PAGE_GZ_LIMIT / 1024} KB)`);
    if (size > PAGE_GZ_LIMIT) fail('The gzipped page is over its size limit.');
  },

  'browser tests against a fake ESP32'() {
    if (!run('npx', ['playwright', 'test', '--project=e2e'], web)) fail('Browser tests failed.');
  },

  'shot logic tests on this PC'() {
    if (!hasHostCompiler()) {
      if (process.env.CI) fail('CI needs g++ for these tests.');
      console.log('SKIPPED: no g++ here, so only CI will run these. To add one: pio pkg install -g -t platformio/toolchain-gccmingw32');
      return;
    }
    if (!pio(['test', '-e', 'native'], firmware)) fail('Shot logic tests failed.');
  },

  'firmware compiles and fits'() {
    const secrets = join(firmware, 'src', 'secrets.h');
    if (!existsSync(secrets)) copyFileSync(join(firmware, 'src', 'secrets.example.h'), secrets);
    if (!pio(['run'], firmware)) fail('The firmware did not compile.');
    const size = statSync(join(firmware, '.pio', 'build', 'esp32dev', 'firmware.bin')).size;
    console.log(`Firmware: ${(size / 1024).toFixed(0)} KB, ${((size / 0x140000) * 100).toFixed(1)}% of the app partition (limit 97%)`);
    if (size > FLASH_LIMIT) fail('The firmware is over its size limit.');
  },
};

for (const [name, step] of Object.entries(steps)) {
  console.log(`\n=== ${name}`);
  try {
    step();
  } catch (e) {
    console.error(`\nFAILED: ${name}\n${e.message}`);
    process.exit(1);
  }
}
console.log('\nAll checks passed.');
