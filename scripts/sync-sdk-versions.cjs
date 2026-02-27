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

// Ruby: Update mlld.gemspec (dot format for RC: 2.0.0.rc83)
const rubyVersion = version.replace(/-rc/, '.rc');
const gemspecPath = 'sdk/ruby/mlld.gemspec';
let gemspec = fs.readFileSync(gemspecPath, 'utf8');
gemspec = gemspec.replace(/spec\.version = '.*'/, `spec.version = '${rubyVersion}'`);
fs.writeFileSync(gemspecPath, gemspec);
console.log(`  ✓ Ruby: ${rubyVersion} (${gemspecPath})`);

// Elixir: Update mix.exs (dot-number format for RC: 2.0.0-rc.83)
const elixirVersion = version.replace(/-rc(\d+)/, '-rc.$1');
const mixPath = 'sdk/elixir/mix.exs';
let mix = fs.readFileSync(mixPath, 'utf8');
mix = mix.replace(/@version ".*"/, `@version "${elixirVersion}"`);
fs.writeFileSync(mixPath, mix);
console.log(`  ✓ Elixir: ${elixirVersion} (${mixPath})`);

// Go: Uses git tags for versioning (sdk/go/vX.Y.Z)
// pkg.go.dev indexes automatically when tag is pushed
console.log(`  ✓ Go: v${version} (git tag sdk/go/v${version})`);

console.log('Done!');
