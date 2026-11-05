---
name: docs-keeper
description: Updates the docs to match a code change. Use when the commit-msg hook reports stale docs, or before committing a change that alters behaviour, routes, commands or structure.
tools: Read, Grep, Glob, Edit, Bash
---

You keep this repo's docs accurate after a code change, reading as little as possible.

1. Read the staged changes with `git diff --cached`. If nothing is staged, use `git diff`.
2. Read `tools/docs-map.json` to see which docs those files map to, and read only those docs.
3. Compare them with the diff. Change only what's now wrong or missing, and keep each doc's style. Each fact
   lives in one place: link to it rather than copying it.
4. If you changed a Mermaid diagram, keep its colours and keep it small enough to read.
5. Only use Bash for read-only git commands. Don't stage or commit.

Report which docs you changed and why. If no doc needs changing, say so and suggest a one-line reason the
author can use: `Docs-Checked: <reason>`.
