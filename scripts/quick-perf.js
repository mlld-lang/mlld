#!/usr/bin/env node

/**
 * Simple performance check using the CLI directly
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.join(__dirname, '..', 'dist', 'cli.cjs');

// Test cases
const tests = [
  { name: 'Simple variable', code: '/var @x = "hello"' },
  { name: 'Template', code: '/var @n = "World"\\n/var @msg = "Hello @n!"' },
  { name: 'Object', code: '/var @user = {name:"Alice",age:30}' },
  { name: 'Array', code: '/var @items = [1,2,3,4,5]' },
  { name: 'For loop', code: '/for @i in [1,2,3] => var @x = @i' },
  { name: 'When', code: '/var @x = 5\\n/when @x > 3 => show "big"' }
];

console.log('\n🚀 Quick MLLD Performance Check\n');
console.log('='.repeat(50));

const results = [];

for (const test of tests) {
  // Write test to temp file
  const tempFile = `/tmp/mlld-perf-${Date.now()}.mld`;
  fs.writeFileSync(tempFile, test.code);
  
  // Measure 10 iterations
  const iterations = 10;
  const times = [];
  
  process.stdout.write(`\n${test.name.padEnd(20)}`);
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      execSync(`node "${cliPath}" "${tempFile}"`, { 
        stdio: 'pipe',
        env: { ...process.env, MLLD_NO_STREAMING: 'true' }
      });
    } catch (e) {
      // Ignore output, we're just measuring time
    }
    const end = performance.now();
    times.push(end - start);
  }
  
  // Clean up
  fs.unlinkSync(tempFile);
  
  const avg = times.reduce((a, b) => a + b, 0) / iterations;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  results.push({ name: test.name, avg, min, max });
  
  console.log(`${avg.toFixed(1)}ms (${min.toFixed(1)}-${max.toFixed(1)}ms)`);
}

console.log('\n' + '='.repeat(50));
console.log('\n📊 Performance Summary:\n');

// Sort by average time
results.sort((a, b) => b.avg - a.avg);

console.log('Slowest operations:');
results.slice(0, 3).forEach((r, i) => {
  console.log(`${i + 1}. ${r.name.padEnd(20)} ${r.avg.toFixed(1)}ms avg`);
});

console.log('\n✅ Quick performance check complete!\n');