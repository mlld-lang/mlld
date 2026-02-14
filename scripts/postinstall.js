#!/usr/bin/env node
// npm postinstall: detect coding tools and nudge skill installation or refresh existing installs.
// Plain JS, no build step. Must never fail the install.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

try {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) process.exit(0);

  const packageRoot = path.resolve(__dirname, '..');
  const pkgJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const version = pkgJson.version;
  const pluginSource = path.join(packageRoot, 'plugins', 'mlld');

  if (!fs.existsSync(pluginSource)) process.exit(0);

  function whichExists(bin) {
    try {
      execFileSync('which', [bin], { encoding: 'utf8', stdio: 'pipe' });
      return true;
    } catch { return false; }
  }

  const harnesses = [
    { name: 'Claude Code', detected: whichExists('claude'), path: null },
    { name: 'Codex', detected: whichExists('codex') || fs.existsSync(path.join(home, '.codex')), path: path.join(home, '.codex') },
    { name: 'Pi', detected: whichExists('pi') || fs.existsSync(path.join(home, '.pi')), path: path.join(home, '.pi') },
    { name: 'OpenCode', detected: whichExists('opencode') || fs.existsSync(path.join(home, '.config', 'opencode')), path: path.join(home, '.config', 'opencode') },
  ];

  const detected = harnesses.filter(h => h.detected);

  // Check for existing version markers (update case)
  const withMarkers = detected.filter(h => {
    if (!h.path) return false;
    const marker = path.join(h.path, 'skills', 'mlld', '.version');
    return fs.existsSync(marker);
  });

  if (withMarkers.length > 0) {
    // Update case: silently re-copy skills
    for (const h of withMarkers) {
      const target = h.name === 'Pi'
        ? path.join(h.path, 'agent', 'skills', 'mlld')
        : path.join(h.path, 'skills', 'mlld');

      fs.mkdirSync(target, { recursive: true });

      const skillsSrc = path.join(pluginSource, 'skills');
      const examplesSrc = path.join(pluginSource, 'examples');

      if (fs.existsSync(skillsSrc)) {
        fs.cpSync(skillsSrc, path.join(target, 'skills'), { recursive: true });
      }
      if (fs.existsSync(examplesSrc)) {
        fs.cpSync(examplesSrc, path.join(target, 'examples'), { recursive: true });
      }
      fs.writeFileSync(path.join(target, '.version'), version, 'utf8');
    }

    const names = withMarkers.map(h => h.name).join(', ');
    console.log(`mlld updated. Skills refreshed for ${names}.`);
  } else if (detected.length > 0) {
    const names = detected.map(h => h.name).join(', ');
    console.log(`\nDetected: ${names}`);
    console.log('  Run `mlld skill install` to add mlld authoring skills to your coding tools.\n');
  }
} catch {
  // Never fail the install
}
