import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateBudgets,
  evaluateRegression,
  loadScenario,
  resolveScenarioConfig,
  runScenarioFile
} from '../../scripts/perf-harness.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../..');
const localScenarioPath = path.join(repoRoot, 'tests/performance/scenarios/local-smoke.json');
const cliScenarioPath = path.join(repoRoot, 'tests/performance/scenarios/cli-smoke.json');

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

  it('applies target defaults for named adapters', () => {
    const { scenario, scenarioDir } = loadScenario(cliScenarioPath);
    const config = resolveScenarioConfig(scenario, scenarioDir, 'short');

    expect(config.target).toBe('cli-script');
    expect(config.command).toBe('node');
    expect(config.args.slice(0, 2)).toEqual([
      'dist/cli.cjs',
      path.join(repoRoot, 'tests/performance/fixtures/perf-cli-smoke.mld')
    ]);
  });

  it('evaluates baseline regression failures', () => {
    const failures = evaluateRegression({
      wallMs: 140,
      peakRssMb: 120,
      metrics: {
        avgMergeUs: { max: 20 }
      }
    }, {
      wallMs: 100,
      peakRssMb: 100,
      metrics: {
        avgMergeUs: { max: 10 }
      }
    }, {
      wallMsPct: 25,
      peakRssMbPct: 25,
      metricsPct: 50
    });

    expect(failures).toEqual([
      'wallMs 140.0 regressed > 25% from baseline 100.0',
      'metric avgMergeUs.max 20.0 regressed > 50% from baseline 10.0'
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
