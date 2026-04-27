import { processMlld } from '../../../dist/index.mjs';

const iterations = Number(process.env.PERF_ITERATIONS || 20);
const source = '/var @name = "sdk-smoke"\n/show @name';
const start = performance.now();

for (let i = 0; i < iterations; i++) {
  await processMlld(source);
}

const wallMs = performance.now() - start;
const used = process.memoryUsage();

console.log(JSON.stringify({
  type: 'metric',
  name: 'avgProcessMlldMs',
  value: wallMs / iterations
}));
console.log(JSON.stringify({
  type: 'metric',
  name: 'heapUsedMb',
  value: used.heapUsed / 1024 / 1024
}));
