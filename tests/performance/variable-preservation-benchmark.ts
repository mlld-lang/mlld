import { performance } from 'perf_hooks';
import { Environment } from '@interpreter/env/Environment';
import { createSimpleTextVariable, createArrayVariable, createObjectVariable } from '@core/types/variable/VariableFactories';
import { evaluateDirective } from '@interpreter/eval/directive';
import { IFileSystemService } from '@core/services/FileSystemService';
import { IPathService } from '@core/services/PathService';
import path from 'path';

// Mock services
const mockFileSystem: IFileSystemService = {
  readFile: async () => '',
  writeFile: async () => {},
  exists: async () => true,
  listFiles: async () => [],
  getStats: async () => ({ isDirectory: () => false } as any),
  createDirectory: async () => {},
  deleteFile: async () => {},
  deleteDirectory: async () => {}
};

const mockPathService: IPathService = {
  resolve: (...paths: string[]) => path.resolve(...paths),
  join: (...paths: string[]) => path.join(...paths),
  dirname: (p: string) => path.dirname(p),
  basename: (p: string) => path.basename(p),
  relative: (from: string, to: string) => path.relative(from, to),
  normalize: (p: string) => path.normalize(p),
  isAbsolute: (p: string) => path.isAbsolute(p),
  extname: (p: string) => path.extname(p)
};

const mockSource = {
  directive: 'var' as const,
  syntax: 'literal' as const,
  hasInterpolation: false,
  isMultiLine: false
};

async function runBenchmark(name: string, enhanced: boolean, testFn: (env: Environment) => Promise<void>) {
  // Set feature flags
  if (enhanced) {
    process.env.MLLD_ENHANCED_ARRAYS = 'true';
    process.env.MLLD_ENHANCED_RESOLUTION = 'true';
  } else {
    delete process.env.MLLD_ENHANCED_ARRAYS;
    delete process.env.MLLD_ENHANCED_RESOLUTION;
  }
  
  const runs = 1000;
  const times: number[] = [];
  
  for (let i = 0; i < runs; i++) {
    const env = new Environment(mockFileSystem, mockPathService, '/test');
    
    const start = performance.now();
    await testFn(env);
    const end = performance.now();
    
    times.push(end - start);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  console.log(`${name} (${enhanced ? 'Enhanced' : 'Normal'}):`);
  console.log(`  Average: ${avg.toFixed(3)}ms`);
  console.log(`  Min: ${min.toFixed(3)}ms`);
  console.log(`  Max: ${max.toFixed(3)}ms`);
  console.log();
}

async function benchmarkLargeArray(env: Environment) {
  // Create 100 variables
  for (let i = 0; i < 100; i++) {
    const var1 = createSimpleTextVariable(`var${i}`, `value${i}`, mockSource);
    env.setVariable(`var${i}`, var1);
  }
  
  // Create array with all variables
  const items = [];
  for (let i = 0; i < 100; i++) {
    items.push({ type: 'VariableReference', identifier: `var${i}` });
  }
  
  const directive = {
    type: 'Directive',
    kind: 'var',
    values: {
      identifier: [{ type: 'VariableReference', identifier: 'bigArray' }],
      value: [{ type: 'array', items }]
    }
  };
  
  await evaluateDirective(directive, env);
}

async function benchmarkDeepNesting(env: Environment) {
  // Create deeply nested structure
  let current: any = { type: 'Text', content: 'leaf' };
  
  for (let i = 0; i < 10; i++) {
    current = {
      type: 'object',
      properties: {
        nested: current,
        level: { type: 'Text', content: `level${i}` }
      }
    };
  }
  
  const directive = {
    type: 'Directive',
    kind: 'var',
    values: {
      identifier: [{ type: 'VariableReference', identifier: 'deepObject' }],
      value: [current]
    }
  };
  
  await evaluateDirective(directive, env);
}

async function benchmarkMixedContent(env: Environment) {
  // Create mix of variables and literals
  for (let i = 0; i < 50; i++) {
    const var1 = createSimpleTextVariable(`item${i}`, `value${i}`, mockSource);
    env.setVariable(`item${i}`, var1);
  }
  
  const items = [];
  for (let i = 0; i < 100; i++) {
    if (i % 2 === 0) {
      items.push({ type: 'VariableReference', identifier: `item${i / 2}` });
    } else {
      items.push({ type: 'Text', content: `literal${i}` });
    }
  }
  
  const directive = {
    type: 'Directive',
    kind: 'var',
    values: {
      identifier: [{ type: 'VariableReference', identifier: 'mixedArray' }],
      value: [{ type: 'array', items }]
    }
  };
  
  await evaluateDirective(directive, env);
}

async function main() {
  console.log('mlld Variable Preservation Performance Benchmark\n');
  console.log('='.repeat(50));
  console.log();
  
  // Large array benchmark
  console.log('Test 1: Large Array (100 elements)');
  console.log('-'.repeat(30));
  await runBenchmark('Large Array', false, benchmarkLargeArray);
  await runBenchmark('Large Array', true, benchmarkLargeArray);
  
  // Deep nesting benchmark
  console.log('Test 2: Deep Nesting (10 levels)');
  console.log('-'.repeat(30));
  await runBenchmark('Deep Nesting', false, benchmarkDeepNesting);
  await runBenchmark('Deep Nesting', true, benchmarkDeepNesting);
  
  // Mixed content benchmark
  console.log('Test 3: Mixed Content (50 vars + 50 literals)');
  console.log('-'.repeat(30));
  await runBenchmark('Mixed Content', false, benchmarkMixedContent);
  await runBenchmark('Mixed Content', true, benchmarkMixedContent);
  
  // Memory usage estimate
  console.log('Memory Usage Analysis:');
  console.log('-'.repeat(30));
  const used = process.memoryUsage();
  console.log(`Heap Used: ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Total: ${(used.heapTotal / 1024 / 1024).toFixed(2)} MB`);
}

// Run if executed directly
main().catch(console.error);