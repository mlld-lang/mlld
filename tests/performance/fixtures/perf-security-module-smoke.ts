import { makeSecurityDescriptor, mergeDescriptors } from '../../../core/types/security';

const iterations = Number(process.env.PERF_ITERATIONS || 25_000);

const left = makeSecurityDescriptor({
  labels: ['known:user', 'src:user', 'public'],
  sources: ['user-task'],
  urls: ['https://example.com/a'],
  tools: [{ name: 'resolve_batch', args: ['hotel'], auditRef: 'audit-1' }],
  policyContext: { domain: 'travel', defense: 'defended' }
});

const right = makeSecurityDescriptor({
  labels: ['known:tool', 'src:mcp'],
  sources: ['mcp:travel'],
  urls: ['https://example.com/b'],
  tools: [{ name: 'derive', args: ['trip'], auditRef: 'audit-2' }],
  policyContext: { phase: 'planner' }
});

const start = performance.now();
let merged = left;

for (let i = 0; i < iterations; i++) {
  merged = mergeDescriptors(left, right, merged);
}

const wallMs = performance.now() - start;
const used = process.memoryUsage();

console.log(JSON.stringify({
  type: 'metric',
  name: 'avgMergeUs',
  value: (wallMs * 1000) / iterations
}));
console.log(JSON.stringify({
  type: 'metric',
  name: 'heapUsedMb',
  value: used.heapUsed / 1024 / 1024
}));
console.log(JSON.stringify({
  type: 'metric',
  name: 'mergedLabelCount',
  value: merged.labels.length
}));
