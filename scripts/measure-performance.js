#!/usr/bin/env node

/**
 * Quick performance measurement script to identify bottlenecks
 * Run with: node scripts/measure-performance.js
 */

import { parse } from '../grammar/generated/parser/parser.js';
import { processMlld } from '../dist/index.mjs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Performance test cases
const testCases = [
  {
    name: 'Simple variable',
    code: '/var @x = "hello"',
    iterations: 10000
  },
  {
    name: 'Object with fields',
    code: '/var @user = { name: "Alice", age: 30, active: true }',
    iterations: 5000
  },
  {
    name: 'Array operations',
    code: '/var @items = [1, 2, 3, 4, 5]\n/var @first = @items[0]',
    iterations: 3000
  },
  {
    name: 'Template interpolation',
    code: '/var @name = "World"\n/var @msg = "Hello @name!"',
    iterations: 3000
  },
  {
    name: 'For loop (5 items)',
    code: '/var @nums = [1,2,3,4,5]\n/for @n in @nums => var @sq = @n',
    iterations: 1000
  },
  {
    name: 'When expression',
    code: '/var @x = 5\n/var @result = when @x > 3 => "big" else "small"',
    iterations: 2000
  },
  {
    name: 'Pipeline (3 stages)',
    code: `/exe @upper(t) = js {return t.toUpperCase();}
/exe @reverse(t) = js {return t.split('').reverse().join('');}
/exe @exclaim(t) = js {return t + '!';}
/var @result = "hello" | @upper | @reverse | @exclaim`,
    iterations: 1000
  },
  {
    name: 'Nested object access',
    code: `/var @data = {
  user: {
    profile: {
      settings: {
        theme: "dark"
      }
    }
  }
}
/var @theme = @data.user.profile.settings.theme`,
    iterations: 2000
  }
];

async function measurePerformance() {
  console.log('\n🚀 MLLD Performance Measurement\n');
  console.log('='.repeat(60));
  
  const results = [];
  
  for (const test of testCases) {
    process.stdout.write(`\nTesting: ${test.name}...`);
    
    // Parse performance
    const parseStartTotal = performance.now();
    for (let i = 0; i < test.iterations; i++) {
      parse(test.code);
    }
    const parseTime = performance.now() - parseStartTotal;
    const avgParseTime = parseTime / test.iterations;
    
    // Interpret performance
    const interpretStartTotal = performance.now();
    for (let i = 0; i < test.iterations; i++) {
      await processMlld(test.code);
    }
    const interpretTime = performance.now() - interpretStartTotal;
    const avgInterpretTime = interpretTime / test.iterations;
    
    const totalAvg = avgParseTime + avgInterpretTime;
    
    results.push({
      name: test.name,
      parseTime: avgParseTime,
      interpretTime: avgInterpretTime,
      totalTime: totalAvg,
      iterations: test.iterations
    });
    
    process.stdout.write(' ✓\n');
    console.log(`  Parse:     ${avgParseTime.toFixed(4)}ms`);
    console.log(`  Interpret: ${avgInterpretTime.toFixed(4)}ms`);
    console.log(`  Total:     ${totalAvg.toFixed(4)}ms`);
  }
  
  // Sort by total time and show bottlenecks
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Performance Bottlenecks (sorted by total time):\n');
  
  results.sort((a, b) => b.totalTime - a.totalTime);
  
  results.forEach((r, i) => {
    const parsePercent = (r.parseTime / r.totalTime * 100).toFixed(1);
    const interpretPercent = (r.interpretTime / r.totalTime * 100).toFixed(1);
    
    console.log(`${i + 1}. ${r.name.padEnd(25)} ${r.totalTime.toFixed(4)}ms`);
    console.log(`   Parse: ${parsePercent}% | Interpret: ${interpretPercent}%`);
    
    if (r.totalTime > 0.5) {
      console.log(`   ⚠️  SLOW - Consider optimizing!`);
    }
  });
  
  // Save detailed report
  const reportPath = path.join(__dirname, '..', 'performance-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      slowest: results[0].name,
      slowestTime: results[0].totalTime,
      fastest: results[results.length - 1].name,
      fastestTime: results[results.length - 1].totalTime
    }
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: performance-report.json`);
  
  // Show optimization suggestions
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Optimization Suggestions:\n');
  
  const parseHeavy = results.filter(r => r.parseTime > r.interpretTime);
  const interpretHeavy = results.filter(r => r.interpretTime > r.parseTime);
  
  if (parseHeavy.length > 0) {
    console.log('Parser-heavy operations:');
    parseHeavy.slice(0, 3).forEach(r => {
      console.log(`  - ${r.name}: Consider grammar optimization`);
    });
  }
  
  if (interpretHeavy.length > 0) {
    console.log('\nInterpreter-heavy operations:');
    interpretHeavy.slice(0, 3).forEach(r => {
      console.log(`  - ${r.name}: Consider runtime optimization`);
    });
  }
  
  console.log('\n✅ Performance measurement complete!\n');
}

measurePerformance().catch(console.error);