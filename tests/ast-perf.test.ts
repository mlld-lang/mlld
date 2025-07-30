import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { performance } from 'perf_hooks';
// Import the skip tests from the main interpreter test
import { skipTests } from '../interpreter/interpreter.fixture.test';
// Import parser directly for pure parsing performance tests
import parser from '../grammar/generated/parser/parser.js';

describe('npm run ast validation and performance', () => {
  const fixturesDir = join(__dirname, 'fixtures');
  const projectRoot = join(__dirname, '..');
  
  // Get all fixture files
  const getFixtureFiles = (dir: string): string[] => {
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getFixtureFiles(fullPath));
      } else if (entry.name.endsWith('.generated-fixture.json')) {
        files.push(fullPath);
      }
    }
    
    return files;
  };

  const fixtureFiles = getFixtureFiles(fixturesDir);
  
  const validFixtures = fixtureFiles.filter(f => {
    if (f.includes('/invalid/') || f.includes('/exceptions/')) return false;
    
    // TODO: Skip examples directory until we review/update the examples
    // Many of these are old and may have syntax that's no longer valid
    if (f.includes('/examples/')) return false;
    
    // Skip .o files - these are output files, not mlld syntax
    if (f.includes('.o.generated-fixture.json')) return false;
    
    // Extract fixture name and check if it's in the skip list
    const fixture = JSON.parse(readFileSync(f, 'utf8'));
    if (skipTests[fixture.name]) {
      return false;
    }
    
    return true;
  });
  
  const skippedCount = Object.keys(skipTests).length;
  console.log(`Found ${validFixtures.length} valid fixtures to test (${skippedCount} skipped)`);

  // Test methods for running ast
  const testMethods = {
    'via stdin (cat | npm run ast)': (mlldCode: string) => {
      const startTime = performance.now();
      const result = execSync('npm run ast', {
        input: mlldCode,
        encoding: 'utf8',
        cwd: projectRoot,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      const endTime = performance.now();
      return { result, time: endTime - startTime };
    },
    
    'via temp file': (mlldCode: string, fixturePath: string) => {
      const tempFile = `/tmp/ast-test-${Date.now()}.mld`;
      const fs = require('fs');
      fs.writeFileSync(tempFile, mlldCode);
      
      const startTime = performance.now();
      const result = execSync(`npm run ast -- ${tempFile}`, {
        encoding: 'utf8',
        cwd: projectRoot,
        maxBuffer: 10 * 1024 * 1024
      });
      const endTime = performance.now();
      
      fs.unlinkSync(tempFile);
      return { result, time: endTime - startTime };
    },
    
    'via command line (if no shell chars)': (mlldCode: string) => {
      // Check for shell-problematic characters
      const shellChars = ['!', '`', '(', ')', '$', ';', '&', '|', '<', '>', '"', "'", '\n', '*', '?', '[', ']', '{', '}'];
      const hasShellChars = shellChars.some(char => mlldCode.includes(char));
      
      if (hasShellChars) {
        return null; // Skip this method for code with shell chars
      }
      
      const startTime = performance.now();
      const result = execSync(`npm run ast -- '${mlldCode}'`, {
        encoding: 'utf8',
        cwd: projectRoot,
        maxBuffer: 10 * 1024 * 1024
      });
      const endTime = performance.now();
      return { result, time: endTime - startTime };
    }
  };

  // Performance tracking
  const performanceStats: Record<string, number[]> = {
    'via stdin (cat | npm run ast)': [],
    'via temp file': [],
    'via command line (if no shell chars)': []
  };

  describe('validate all valid fixtures produce ASTs', () => {
    for (const fixturePath of validFixtures) {
      const fixtureRelPath = relative(projectRoot, fixturePath);
      
      it(`should parse ${fixtureRelPath}`, () => {
        const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
        const mlldCode = fixture.input;
        
        // Skip empty files
        if (!mlldCode || mlldCode.trim() === '') {
          return;
        }
        
        let successCount = 0;
        const errors: Record<string, string> = {};
        
        for (const [method, testFn] of Object.entries(testMethods)) {
          try {
            const result = testFn(mlldCode, fixturePath);
            
            if (result === null) {
              // Method skipped due to shell chars
              continue;
            }
            
            // Verify it produced an AST (contains 'type' fields)
            expect(result.result).toContain("type:");
            expect(result.result).toContain("'Directive'");
            
            // Track performance
            performanceStats[method].push(result.time);
            successCount++;
          } catch (error: any) {
            errors[method] = error.message || error.toString();
          }
        }
        
        // At least one method should work
        if (successCount === 0) {
          console.error(`\nAll methods failed for ${fixtureRelPath}:`);
          console.error('mlld code:', mlldCode.slice(0, 100) + (mlldCode.length > 100 ? '...' : ''));
          Object.entries(errors).forEach(([method, error]) => {
            console.error(`  ${method}: ${error.split('\n')[0]}`);
          });
        }
        
        expect(successCount).toBeGreaterThan(0);
      });
    }
  });

  describe('performance summary', () => {
    it('should report parsing performance stats', () => {
      console.log('\n=== Parsing Performance Summary ===\n');
      
      // Calculate detailed statistics
      const stats: Record<string, any> = {};
      
      for (const [method, times] of Object.entries(performanceStats)) {
        if (times.length === 0) continue;
        
        const sorted = [...times].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);
        const avg = sum / sorted.length;
        
        // Calculate standard deviation
        const squaredDiffs = sorted.map(time => Math.pow(time - avg, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / sorted.length;
        const stdDev = Math.sqrt(avgSquaredDiff);
        
        // Calculate percentiles
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p90 = sorted[Math.floor(sorted.length * 0.9)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        
        stats[method] = {
          samples: sorted.length,
          avg,
          stdDev,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          p50,
          p90,
          p95,
          p99
        };
        
        console.log(`${method}:`);
        console.log(`  Samples:  ${sorted.length}`);
        console.log(`  Average:  ${avg.toFixed(2)}ms ± ${stdDev.toFixed(2)}ms`);
        console.log(`  Median:   ${p50.toFixed(2)}ms`);
        console.log(`  Min:      ${sorted[0].toFixed(2)}ms`);
        console.log(`  Max:      ${sorted[sorted.length - 1].toFixed(2)}ms`);
        console.log(`  P90:      ${p90.toFixed(2)}ms`);
        console.log(`  P95:      ${p95.toFixed(2)}ms`);
        console.log(`  P99:      ${p99.toFixed(2)}ms`);
        console.log('');
      }
      
      // Save results with timestamp
      const perfResults = {
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        totalFixtures: validFixtures.length,
        stats
      };
      
      // Write to parseperf-results.json
      const resultsPath = join(projectRoot, 'parseperf-results.json');
      let existingResults = [];
      try {
        existingResults = JSON.parse(readFileSync(resultsPath, 'utf8'));
      } catch (e) {
        // File doesn't exist yet
      }
      
      existingResults.push(perfResults);
      
      // Keep only last 100 runs
      if (existingResults.length > 100) {
        existingResults = existingResults.slice(-100);
      }
      
      require('fs').writeFileSync(resultsPath, JSON.stringify(existingResults, null, 2));
      console.log(`Performance results saved to ${relative(projectRoot, resultsPath)}`);
      
      // This test always passes, it's just for reporting
      expect(true).toBe(true);
    });
  });

  describe('shell escaping detection', () => {
    it('should properly detect shell escaping issues', () => {
      const problematicCases = [
        '/when @isValid && !@isLocked => /show "OK"',
        '/when (@role == "admin") && @active => /show `OK`',
        '/var @message = `Hello @name!`',
        '/var @formatted = `<data.json>|@json`'
      ];
      
      for (const testCase of problematicCases) {
        try {
          // This should fail with shell escaping
          execSync(`npm run ast -- '${testCase}'`, {
            encoding: 'utf8',
            cwd: projectRoot
          });
          
          // If it didn't fail, that's actually good - means our fix works!
        } catch (error: any) {
          const output = error.stdout || error.stderr || error.toString();
          
          // Should either work (with our spawnSync fix) or show helpful error
          const worksOrHasHelpfulError = 
            output.includes('type:') || // It worked!
            output.includes('shell escaping issue detected') || // Helpful error
            output.includes('Try one of these alternatives'); // Helpful suggestions
            
          expect(worksOrHasHelpfulError).toBe(true);
        }
      }
    });
  });
  
  describe('pure parser performance', () => {
    it('should measure direct parser performance without process overhead', () => {
      console.log('\n=== Pure Parser Performance (no process overhead) ===\n');
      
      const parserTimes: number[] = [];
      const fixturePerformance: Array<{ path: string; time: number; size: number }> = [];
      const sizeCategories: Record<string, number[]> = {
        small: [],    // < 1KB
        medium: [],   // 1KB - 10KB
        large: []     // > 10KB
      };
      
      // Test a subset of fixtures for pure parser performance
      const testFixtures = validFixtures.slice(0, Math.min(50, validFixtures.length));
      
      for (const fixturePath of testFixtures) {
        const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
        const mlldCode = fixture.input;
        
        if (!mlldCode || mlldCode.trim() === '') continue;
        
        // Categorize by size
        const sizeBytes = Buffer.byteLength(mlldCode, 'utf8');
        const category = sizeBytes < 1024 ? 'small' : 
                        sizeBytes < 10240 ? 'medium' : 'large';
        
        // Warm up the parser
        try {
          parser.parse(mlldCode);
        } catch (e) {
          // Skip fixtures that fail to parse
          continue;
        }
        
        // Measure parsing time (average of 5 runs)
        const runs = 5;
        let totalTime = 0;
        
        for (let i = 0; i < runs; i++) {
          const start = performance.now();
          try {
            parser.parse(mlldCode);
          } catch (e) {
            // Parsing errors are ok, we're measuring performance
          }
          const end = performance.now();
          totalTime += (end - start);
        }
        
        const avgTime = totalTime / runs;
        parserTimes.push(avgTime);
        sizeCategories[category].push(avgTime);
        fixturePerformance.push({
          path: relative(projectRoot, fixturePath),
          time: avgTime,
          size: sizeBytes
        });
      }
      
      // Report results
      if (parserTimes.length > 0) {
        const sorted = [...parserTimes].sort((a, b) => a - b);
        const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        
        console.log('Overall Parser Performance:');
        console.log(`  Samples:  ${sorted.length}`);
        console.log(`  Average:  ${avg.toFixed(3)}ms`);
        console.log(`  Median:   ${median.toFixed(3)}ms`);
        console.log(`  Min:      ${sorted[0].toFixed(3)}ms`);
        console.log(`  Max:      ${sorted[sorted.length - 1].toFixed(3)}ms`);
        console.log('');
        
        console.log('Performance by File Size:');
        for (const [category, times] of Object.entries(sizeCategories)) {
          if (times.length === 0) continue;
          const catAvg = times.reduce((a, b) => a + b, 0) / times.length;
          console.log(`  ${category}: ${catAvg.toFixed(3)}ms avg (${times.length} samples)`);
        }
        console.log('');
        
        // Sort fixtures by parse time
        const sortedFixtures = [...fixturePerformance].sort((a, b) => b.time - a.time);
        
        // Calculate 30th percentile threshold
        const p30Index = Math.floor(sortedFixtures.length * 0.3);
        const p30Threshold = sortedFixtures[p30Index].time;
        
        console.log(`Slowest fixtures (top 30%, >${p30Threshold.toFixed(3)}ms):`);
        const slowestPatterns: Record<string, number> = {};
        
        for (let i = 0; i <= p30Index && i < 10; i++) { // Show max 10
          const fixture = sortedFixtures[i];
          const fixData = JSON.parse(readFileSync(join(projectRoot, fixture.path), 'utf8'));
          const code = fixData.input || '';
          
          // Check for common patterns
          if (code.includes('/run node')) slowestPatterns['run node'] = (slowestPatterns['run node'] || 0) + 1;
          if (code.includes('/run js')) slowestPatterns['run js'] = (slowestPatterns['run js'] || 0) + 1;
          if (code.includes('/sh ')) slowestPatterns['sh'] = (slowestPatterns['sh'] || 0) + 1;
          if (code.includes('command substitution')) slowestPatterns['cmd substitution'] = (slowestPatterns['cmd substitution'] || 0) + 1;
          if (code.includes('/var @') && code.includes('= {')) slowestPatterns['complex objects'] = (slowestPatterns['complex objects'] || 0) + 1;
          if (code.includes('[') && code.includes(']')) slowestPatterns['arrays'] = (slowestPatterns['arrays'] || 0) + 1;
          
          console.log(`  ${fixture.time.toFixed(3)}ms - ${fixture.path} (${fixture.size} bytes)`);
        }
        
        if (Object.keys(slowestPatterns).length > 0) {
          console.log('\nPatterns in slowest fixtures:');
          Object.entries(slowestPatterns)
            .sort((a, b) => b[1] - a[1])
            .forEach(([pattern, count]) => {
              console.log(`  ${pattern}: ${count} occurrences`);
            });
        }
        console.log('');
        
        console.log('Fastest fixtures (for comparison):');
        for (let i = sortedFixtures.length - 1; i >= sortedFixtures.length - 5 && i >= 0; i--) {
          const fixture = sortedFixtures[i];
          console.log(`  ${fixture.time.toFixed(3)}ms - ${fixture.path} (${fixture.size} bytes)`);
        }
        
        // Performance expectations
        expect(median).toBeLessThan(10); // Median parse time should be under 10ms
        expect(avg).toBeLessThan(20);    // Average should be under 20ms
      }
    });
  });
});