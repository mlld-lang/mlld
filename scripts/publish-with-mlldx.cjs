#!/usr/bin/env node

/**
 * Custom publish script that ensures mlldx is published with the same tag as mlld
 * Usage: npm run publish:all -- --tag latest
 */

const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const tagIndex = args.indexOf('--tag');
const tag = tagIndex !== -1 && args[tagIndex + 1] ? args[tagIndex + 1] : 'latest';

// --provenance only works in CI (GitHub Actions)
const provenance = process.env.GITHUB_ACTIONS ? '--provenance' : '';

console.log(`🚀 Publishing mlld and mlldx with tag: ${tag}`);

try {
  // First, sync mlldx version
  console.log('\n📦 Syncing mlldx version...');
  execSync('npm run sync:mlldx', { stdio: 'inherit' });
  
  // Publish main package (with --ignore-scripts to skip postpublish)
  console.log('\n📦 Publishing mlld...');
  execSync(`npm publish --tag ${tag} --ignore-scripts ${provenance}`.trim(), { stdio: 'inherit' });
  
  // Publish mlldx with the same tag
  console.log('\n📦 Publishing mlldx...');
  execSync(`npm run publish:mlldx -- --tag ${tag}`, { stdio: 'inherit' });
  
  console.log('\n✅ Successfully published both packages!');
} catch (error) {
  console.error('\n❌ Publishing failed:', error.message);
  process.exit(1);
}