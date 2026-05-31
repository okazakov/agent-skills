#!/usr/bin/env node
// munch-inject.js - SessionStart hook (plugin build).
// Reads the using-munch-tools SKILL.md, wraps it in a pseudo-system frame, and
// emits it as SessionStart additionalContext so the voice re-fires on
// startup|clear|compact (survives compaction). Self-targeted harness enforcement.
//
// Schema (verified against Claude Code hooks reference - identical for plugin and
// user-settings hooks):
//   stdout JSON: { "hookSpecificOutput": {
//       "hookEventName": "SessionStart", "additionalContext": "<string>" } }
// Never throws out of the session: any failure exits 0 silently.

'use strict';

const fs = require('fs');
const path = require('path');

try {
  // As a plugin, CLAUDE_PLUGIN_ROOT is the absolute plugin install dir. Fall back
  // to a path relative to this script so it also works as a standalone hook.
  const root = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
  const skillPath = path.join(root, 'skills', 'using-munch-tools', 'SKILL.md');

  let skill;
  try {
    skill = fs.readFileSync(skillPath, 'utf8');
  } catch (e) {
    // Skill file missing - do not break session start, just inject nothing.
    process.exit(0);
  }

  const preamble =
    'You have munch-powers: jcodemunch (code navigation) and jdocmunch (doc ' +
    'navigation), both audited and pinned. They are your sanctioned way to SEARCH.\n\n' +
    "**Below is the full content of your 'using-munch-tools' skill. For all other " +
    "skills, use the 'Skill' tool:**";

  const additionalContext =
    '<EXTREMELY_IMPORTANT>\n' +
    preamble + '\n\n---\n' +
    skill.trim() + '\n' +
    '</EXTREMELY_IMPORTANT>';

  const out = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: additionalContext
    }
  };

  process.stdout.write(JSON.stringify(out));
  process.exit(0);
} catch (e) {
  // Absolutely never strand a session because of this hook.
  process.exit(0);
}
