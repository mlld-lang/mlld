import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parse } from '../../grammar/generated/parser/parser';
import { interpret } from '../../interpreter/index';
import { Environment } from '../../interpreter/env/Environment';
import * as fs from 'fs';
import * as path from 'path';

interface PerformanceResult {
  name: string;
  duration: number;
  iterations: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  stdDev: number;
}

class PerformanceTracker {
  private results: PerformanceResult[] = [];
  private reportPath = '/tmp/mlld-performance-report.json';

  measure(name: string, fn: () => void, iterations = 100): PerformanceResult {
    const durations: number[] = [];
    
    // Warm up (5 iterations)
    for (let i = 0; i < 5; i++) {
      fn();
    }
    
    // Actual measurements
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      fn();
      const end = performance.now();
      durations.push(end - start);
    }
    
    const sum = durations.reduce((a, b) => a + b, 0);
    const avgDuration = sum / iterations;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    // Calculate standard deviation
    const squaredDiffs = durations.map(d => Math.pow(d - avgDuration, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / iterations;
    const stdDev = Math.sqrt(avgSquaredDiff);
    
    const result: PerformanceResult = {
      name,
      duration: sum,
      iterations,
      avgDuration,
      minDuration,
      maxDuration,
      stdDev
    };
    
    this.results.push(result);
    return result;
  }
  
  async measureAsync(name: string, fn: () => Promise<void>, iterations = 100): Promise<PerformanceResult> {
    const durations: number[] = [];
    
    // Warm up
    for (let i = 0; i < 5; i++) {
      await fn();
    }
    
    // Actual measurements
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      durations.push(end - start);
    }
    
    const sum = durations.reduce((a, b) => a + b, 0);
    const avgDuration = sum / iterations;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    const squaredDiffs = durations.map(d => Math.pow(d - avgDuration, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / iterations;
    const stdDev = Math.sqrt(avgSquaredDiff);
    
    const result: PerformanceResult = {
      name,
      duration: sum,
      iterations,
      avgDuration,
      minDuration,
      maxDuration,
      stdDev
    };
    
    this.results.push(result);
    return result;
  }
  
  getReport(): string {
    const sorted = [...this.results].sort((a, b) => b.avgDuration - a.avgDuration);
    
    let report = '\n=== MLLD Performance Report ===\n\n';
    report += 'Top Performance Bottlenecks (sorted by avg duration):\n';
    report += '─'.repeat(80) + '\n';
    
    sorted.forEach((result, index) => {
      report += `\n${index + 1}. ${result.name}\n`;
      report += `   Avg: ${result.avgDuration.toFixed(3)}ms`;
      report += ` | Min: ${result.minDuration.toFixed(3)}ms`;
      report += ` | Max: ${result.maxDuration.toFixed(3)}ms`;
      report += ` | StdDev: ${result.stdDev.toFixed(3)}ms\n`;
      report += `   Total: ${result.duration.toFixed(2)}ms over ${result.iterations} iterations\n`;
    });
    
    return report;
  }
  
  saveReport(): void {
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: {
        totalTests: this.results.length,
        slowestOperation: this.results.reduce((a, b) => a.avgDuration > b.avgDuration ? a : b).name,
        fastestOperation: this.results.reduce((a, b) => a.avgDuration < b.avgDuration ? a : b).name,
      }
    };
    
    fs.writeFileSync(this.reportPath, JSON.stringify(report, null, 2));
    
    // Also output to console if MLLD_PERF environment variable is set
    if (process.env.MLLD_PERF === 'true') {
      console.log(this.getReport());
      console.log(`\nDetailed report saved to: ${this.reportPath}`);
    }
  }
}

describe('Performance Benchmarks', () => {
  let tracker: PerformanceTracker;
  
  beforeAll(() => {
    tracker = new PerformanceTracker();
  });
  
  afterAll(() => {
    tracker.saveReport();
  });
  
  describe('Parser Performance', () => {
    it('should measure simple directive parsing', () => {
      const result = tracker.measure('Parse simple var directive', () => {
        parse('/var @x = "hello"');
      }, 1000);
      
      expect(result.avgDuration).toBeLessThan(1); // Should be < 1ms
    });
    
    it('should measure complex nested parsing', () => {
      const complexMlld = `
/var @data = {
  users: [
    { name: "Alice", age: 30, roles: ["admin", "user"] },
    { name: "Bob", age: 25, roles: ["user"] }
  ],
  settings: {
    theme: "dark",
    notifications: true
  }
}

/for @user in @data.users => when first [
  @user.age > 28 => show "Senior: @user.name"
  * => show "Junior: @user.name"
]
      `;
      
      const result = tracker.measure('Parse complex nested structure', () => {
        parse(complexMlld);
      }, 500);
      
      expect(result.avgDuration).toBeLessThan(5);
    });
    
    it('should measure large file parsing', () => {
      // Create a large test file with many directives
      const lines: string[] = [];
      for (let i = 0; i < 100; i++) {
        lines.push(`/var @var${i} = "value${i}"`);
        lines.push(`/show "Item ${i}: @var${i}"`);
      }
      const largeMlld = lines.join('\n');
      
      const result = tracker.measure('Parse 200 directives', () => {
        parse(largeMlld);
      }, 100);
      
      expect(result.avgDuration).toBeLessThan(20);
    });
  });
  
  describe('Interpreter Performance', () => {
    it('should measure variable assignment', async () => {
      const result = await tracker.measureAsync('Variable assignment', async () => {
        const env = new Environment();
        await interpret('/var @x = "hello"', { env });
      }, 500);
      
      expect(result.avgDuration).toBeLessThan(2);
    });
    
    it('should measure for loop performance', async () => {
      const mlld = `
/var @items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
/for @item in @items => var @squared = @item * @item
      `;
      
      const result = await tracker.measureAsync('For loop (10 items)', async () => {
        const env = new Environment();
        await interpret(mlld, { env });
      }, 200);
      
      expect(result.avgDuration).toBeLessThan(10);
    });
    
    it('should measure pipeline performance', async () => {
      const mlld = `
/exe @upper(text) = js { return text.toUpperCase(); }
/exe @reverse(text) = js { return text.split('').reverse().join(''); }
/exe @trim(text) = js { return text.trim(); }

/var @result = "  hello world  " | @trim | @upper | @reverse
      `;
      
      const result = await tracker.measureAsync('Pipeline (3 stages)', async () => {
        const env = new Environment();
        await interpret(mlld, { env });
      }, 300);
      
      expect(result.avgDuration).toBeLessThan(5);
    });
    
    it('should measure when expression evaluation', async () => {
      const mlld = `
/var @score = 85
/var @grade = when first [
  @score >= 90 => "A"
  @score >= 80 => "B"
  @score >= 70 => "C"
  @score >= 60 => "D"
  * => "F"
]
      `;
      
      const result = await tracker.measureAsync('When expression (5 conditions)', async () => {
        const env = new Environment();
        await interpret(mlld, { env });
      }, 400);
      
      expect(result.avgDuration).toBeLessThan(3);
    });
    
    it('should measure object field access', async () => {
      const mlld = `
/var @data = {
  level1: {
    level2: {
      level3: {
        level4: {
          value: "deep"
        }
      }
    }
  }
}
/var @result = @data.level1.level2.level3.level4.value
      `;
      
      const result = await tracker.measureAsync('Deep object access (5 levels)', async () => {
        const env = new Environment();
        await interpret(mlld, { env });
      }, 300);
      
      expect(result.avgDuration).toBeLessThan(3);
    });
    
    it('should measure template interpolation', async () => {
      const mlld = `
/var @name = "World"
/var @count = 42
/var @items = ["apple", "banana", "cherry"]
/var @message = "Hello @name! Count: @count. Items: @items[0], @items[1], @items[2]"
      `;
      
      const result = await tracker.measureAsync('Template interpolation (complex)', async () => {
        const env = new Environment();
        await interpret(mlld, { env });
      }, 400);
      
      expect(result.avgDuration).toBeLessThan(4);
    });
    
    it('should measure import resolution', async () => {
      const mlld = `
/import { @greeting, @farewell } from "./fixtures/test-module.mld"
/show @greeting
      `;
      
      // Create a mock module file
      const fixturesDir = path.join(process.cwd(), 'fixtures');
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(fixturesDir, 'test-module.mld'),
        '/var @greeting = "Hello"\n/var @farewell = "Goodbye"'
      );
      
      const result = await tracker.measureAsync('Import resolution', async () => {
        const env = new Environment();
        await interpret(mlld, { env });
      }, 100);
      
      expect(result.avgDuration).toBeLessThan(15);
      
      // Cleanup
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    });
  });
  
  describe('Memory-Intensive Operations', () => {
    it('should measure large array operations', async () => {
      const mlld = `
/var @large = js {
  const arr = [];
  for (let i = 0; i < 1000; i++) {
    arr.push({ id: i, value: 'item' + i });
  }
  return arr;
}
/var @filtered = js {
  return large.filter(item => item.id % 2 === 0);
}
      `;
      
      const result = await tracker.measureAsync('Large array (1000 items) filter', async () => {
        const env = new Environment();
        await interpret(mlld, { env });
      }, 50);
      
      expect(result.avgDuration).toBeLessThan(20);
    });
    
    it('should measure recursive function calls', async () => {
      const mlld = `
/exe @fibonacci(n) = js {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
/var @result = @fibonacci(10)
      `;
      
      const result = await tracker.measureAsync('Recursive fibonacci(10)', async () => {
        const env = new Environment();
        await interpret(mlld, { env });
      }, 100);
      
      expect(result.avgDuration).toBeLessThan(10);
    });
  });
});
