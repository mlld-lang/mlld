#!/usr/bin/env node
/**
 * Sync SDK versions with main package version.
 * Usage: node scripts/sync-sdk-versions.js
 */
const fs = require('fs');
const path = require('path');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

console.log(`Syncing SDK versions to ${version}`);

// Python: Update pyproject.toml
const pyprojectPath = 'sdk/python/pyproject.toml';
let pyproject = fs.readFileSync(pyprojectPath, 'utf8');
pyproject = pyproject.replace(/^version = ".*"$/m, `version = "${version}"`);
fs.writeFileSync(pyprojectPath, pyproject);
console.log(`  ✓ Python: ${pyprojectPath}`);

// Rust: Update Cargo.toml
const cargoPath = 'sdk/rust/Cargo.toml';
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo);
console.log(`  ✓ Rust: ${cargoPath}`);

// Go: go.mod doesn't need version update (uses git tags)
console.log(`  ✓ Go: Uses git tags (sdk/go/v${version})`);

console.log('Done!');
