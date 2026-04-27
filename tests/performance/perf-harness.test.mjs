import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateBudgets,
  loadScenario,
  resolveScenarioConfig,
  runScenarioFile
} from '../../scripts/perf-harness.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../..');
const localScenarioPath = path.join(repoRoot, 'tests/performance/scenarios/local-smoke.json');

describe('perf harness', () => {
  it('loads and resolves scenario manifests', () => {
    const { scenario, scenarioDir } = loadScenario(localScenarioPath);
    const config = resolveScenarioConfig(scenario, scenarioDir, 'short');

    expect(config.name).toBe('local-smoke');
    expect(config.target).toBe('process');
    expect(config.cwd).toBe(repoRoot);
    expect(config.command).toBe('node');
    expect(config.args).toEqual(['tests/performance/fixtures/perf-smoke-child.mjs']);
    expect(config.budgets.wallMs).toBeGreaterThan(0);
  });

  it('evaluates budget failures without running a scenario', () => {
    const failures = evaluateBudgets({
      exitCode: 0,
      signal: null,
      wallMs: 150,
      peakRssMb: 80,
      metrics: {
        heapUsedMb: { min: 10, max: 20, last: 20, count: 1 }
      }
    }, {
      exitCode: 0,
      wallMs: 100,
      peakRssMb: 64,
      metrics: {
        heapUsedMb: { max: 16 }
      }
    });

    expect(failures).toEqual([
      'wallMs 150.0 > 100',
      'peakRssMb 80.0 > 64',
      'metric heapUsedMb.max 20.0 > 16'
    ]);
  });

  it('runs the local smoke scenario through the child-process adapter', async () => {
    const result = await runScenarioFile(localScenarioPath, { mode: 'short' });

    expect(result.status).toBe('pass');
    expect(result.exitCode).toBe(0);
    expect(result.wallMs).toBeGreaterThan(0);
    expect(result.peakRssMb).toBeGreaterThan(0);
    expect(result.metrics.heapUsedMb.count).toBeGreaterThan(0);
    expect(result.metrics.retainedChunks.last).toBe(4);
  }, 10000);
});
