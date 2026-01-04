#!/usr/bin/env node
/**
 * Sync SDK versions with main package version.
 * Usage: node scripts/sync-sdk-versions.js
 */
const fs = require('fs');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

// PyPI uses PEP 440: 2.0.0rc78 (no hyphen before rc)
const pypiVersion = version.replace(/-rc/, 'rc');

// Cargo/crates.io uses SemVer: 2.0.0-rc78 (hyphen is fine)
const cargoVersion = version;

console.log(`Syncing SDK versions to ${version}`);

// Python: Update pyproject.toml (PEP 440 format)
const pyprojectPath = 'sdk/python/pyproject.toml';
let pyproject = fs.readFileSync(pyprojectPath, 'utf8');
pyproject = pyproject.replace(/^version = ".*"$/m, `version = "${pypiVersion}"`);
fs.writeFileSync(pyprojectPath, pyproject);
console.log(`  ✓ Python: ${pypiVersion} (${pyprojectPath})`);

// Rust: Update Cargo.toml (SemVer format)
const cargoPath = 'sdk/rust/Cargo.toml';
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version = ".*"$/m, `version = "${cargoVersion}"`);
fs.writeFileSync(cargoPath, cargo);
console.log(`  ✓ Rust: ${cargoVersion} (${cargoPath})`);

// Go: Uses git tags for versioning (sdk/go/vX.Y.Z)
// pkg.go.dev indexes automatically when tag is pushed
console.log(`  ✓ Go: v${version} (git tag sdk/go/v${version})`);

console.log('Done!');
