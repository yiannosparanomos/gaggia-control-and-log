// Runs PlatformIO, which often isn't on PATH when it was installed through the VS Code extension.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const pioHome = join(homedir(), '.platformio');
const installed = [join(pioHome, 'penv', 'Scripts', 'pio.exe'), join(pioHome, 'penv', 'bin', 'pio')].find(existsSync);
const bin = installed ?? 'pio';
// Windows has no host compiler by default. `pio pkg install -g -t platformio/toolchain-gccmingw32` adds one.
const mingw = join(pioHome, 'packages', 'toolchain-gccmingw32', 'bin');
const env = { ...process.env, PATH: existsSync(mingw) ? mingw + delimiter + process.env.PATH : process.env.PATH };

export function pio(args, cwd) {
  const r = spawnSync(bin, args, { cwd, stdio: 'inherit', env });
  if (r.error) throw new Error(`Could not run PlatformIO (${bin}): ${r.error.message}`);
  return r.status === 0;
}

export function hasHostCompiler() {
  return spawnSync('g++', ['--version'], { env, shell: process.platform === 'win32', stdio: 'ignore' }).status === 0;
}
