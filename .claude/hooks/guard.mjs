// Claude Code hook: blocks commands that would wipe the journal or get around the repo's protections.
// CLAUDE.md asks; this enforces. It only covers commands Claude runs, not ones you type yourself.
const RULES = [
  [/\b(pio|platformio|pio\.exe)\b[^\n;&|]*(-t|--target)[ =]*(uploadfs|uploadfsota|erase|erase_upload)\b/i, 'This wipes the journal stored on the ESP32.'],
  [/\b(erase[_-]flash|erase[_-]region)\b/i, 'This wipes the journal stored on the ESP32.'],
  [/\bgit\s+add\b[^\n;&|]*(secrets\.h|CLAUDE\.local\.md|backups[\\/])/i, 'This file is private and must not be committed.'],
  [/\bgit\s+add\b[^\n;&|]*\s(-f|--force)\b/i, 'Forcing past .gitignore could commit private files.'],
  [/\bgit\s+(commit|push)\b[^\n;&|]*\s(--no-verify|-n)\b/i, "Skipping git hooks would skip the docs check. Fix what it reports, or add a 'Docs-Checked: <reason>' line."],
];

export function blockReason(command) {
  return RULES.find(([pattern]) => pattern.test(command))?.[1] ?? null;
}

if (process.argv[1]?.endsWith('guard.mjs')) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const reason = blockReason(JSON.parse(input).tool_input?.command ?? '');
  if (reason) {
    console.error(`Blocked by .claude/hooks/guard.mjs: ${reason} If this is really needed, ask the owner to run it.`);
    process.exit(2);
  }
}
