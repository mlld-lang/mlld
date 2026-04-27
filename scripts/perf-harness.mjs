#!/usr/bin/env node

import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

const PROCESS_TARGETS = new Set([
  'process',
  'cli-script',
  'sdk-script',
  'module',
  'fixture-replay'
]);

export function expandPath(value, baseDir = repoRoot) {
  if (!value) return value;
  let expanded = value.replaceAll('{repoRoot}', repoRoot);
  if (expanded === '~') {
    expanded = os.homedir();
  } else if (expanded.startsWith('~/')) {
    expanded = path.join(os.homedir(), expanded.slice(2));
  }
  return path.isAbsolute(expanded) ? expanded : path.resolve(baseDir, expanded);
}

export function loadScenario(scenarioPath) {
  const resolvedPath = expandPath(scenarioPath, process.cwd());
  const raw = readFileSync(resolvedPath, 'utf8');
  const scenario = JSON.parse(raw);

  if (!scenario.name || typeof scenario.name !== 'string') {
    throw new Error(`Scenario ${resolvedPath} must define a string name`);
  }
  if (!scenario.target || typeof scenario.target !== 'string') {
    throw new Error(`Scenario ${scenario.name} must define a string target`);
  }

  return {
    scenario,
    scenarioPath: resolvedPath,
    scenarioDir: path.dirname(resolvedPath)
  };
}

export function resolveScenarioConfig(scenario, scenarioDir, mode = 'short') {
  const modeConfig = scenario.modes?.[mode];
  if (!modeConfig) {
    const modes = Object.keys(scenario.modes || {}).join(', ') || '(none)';
    throw new Error(`Scenario ${scenario.name} has no mode "${mode}". Available modes: ${modes}`);
  }

  const merged = {
    ...scenario,
    ...modeConfig,
    mode,
    env: {
      ...(scenario.env || {}),
      ...(modeConfig.env || {})
    },
    budgets: {
      ...(scenario.budgets || {}),
      ...(modeConfig.budgets || {})
    },
    preRun: [
      ...(scenario.preRun || []),
      ...(modeConfig.preRun || [])
    ]
  };

  merged.cwd = expandPath(merged.cwd || '{repoRoot}', scenarioDir);
  merged.entry = expandPath(merged.entry || '', merged.cwd);
  applyTargetDefaults(merged);
  merged.command = expandCommand(merged.command, scenarioDir);
  merged.args = (merged.args || []).map(arg => expandArg(arg, scenarioDir));
  merged.collect = merged.collect || ['wall'];
  merged.timeoutMs = Number(merged.timeoutMs || 0);
  merged.sampleIntervalMs = Number(merged.sampleIntervalMs || 250);

  if (!Array.isArray(merged.args)) {
    throw new Error(`Scenario ${scenario.name} mode ${mode} args must be an array`);
  }
  if (!merged.command || typeof merged.command !== 'string') {
    throw new Error(`Scenario ${scenario.name} mode ${mode} must define a command`);
  }

  return merged;
}

function applyTargetDefaults(config) {
  if (config.command) return;

  if (config.target === 'cli-script') {
    if (!config.entry) {
      throw new Error(`Scenario ${config.name} target cli-script requires entry or command`);
    }
    config.command = 'node';
    config.args = ['dist/cli.cjs', config.entry, '--stdout', '--no-progress', ...(config.args || [])];
    return;
  }

  if (config.target === 'sdk-script') {
    if (!config.entry) {
      throw new Error(`Scenario ${config.name} target sdk-script requires entry or command`);
    }
    config.command = 'node';
    config.args = [config.entry, ...(config.args || [])];
    return;
  }

  if (config.target === 'module') {
    if (!config.entry) {
      throw new Error(`Scenario ${config.name} target module requires entry or command`);
    }
    config.command = 'npx';
    config.args = ['tsx', config.entry, ...(config.args || [])];
    return;
  }

  if (config.target === 'fixture-replay') {
    throw new Error(`Scenario ${config.name} target fixture-replay requires command until native fixture replay is implemented`);
  }
}

function expandCommand(command, baseDir) {
  if (!command) return command;
  if (command.includes('/') || command.startsWith('~') || command.includes('{repoRoot}')) {
    return expandPath(command, baseDir);
  }
  return command;
}

function expandArg(arg, baseDir) {
  if (typeof arg !== 'string') return arg;
  if (arg.startsWith('~/') || arg === '~' || arg.includes('{repoRoot}')) {
    return expandPath(arg, baseDir);
  }
  return arg;
}

export function evaluateBudgets(result, budgets = {}) {
  const failures = [];

  if (Number.isFinite(budgets.exitCode) && result.exitCode !== budgets.exitCode) {
    failures.push(`exitCode ${result.exitCode} !== expected ${budgets.exitCode}`);
  } else if (!Number.isFinite(budgets.exitCode) && result.exitCode !== 0) {
    failures.push(`exitCode ${result.exitCode} !== expected 0`);
  }
  if (budgets.signal == null && result.signal) {
    failures.push(`signal ${result.signal}`);
  }
  if (Number.isFinite(budgets.wallMs) && result.wallMs > budgets.wallMs) {
    failures.push(`wallMs ${result.wallMs.toFixed(1)} > ${budgets.wallMs}`);
  }
  if (Number.isFinite(budgets.peakRssMb) && result.peakRssMb != null && result.peakRssMb > budgets.peakRssMb) {
    failures.push(`peakRssMb ${result.peakRssMb.toFixed(1)} > ${budgets.peakRssMb}`);
  }

  for (const [name, budget] of Object.entries(budgets.metrics || {})) {
    const metric = result.metrics?.[name];
    if (!metric) {
      failures.push(`metric ${name} was not reported`);
      continue;
    }
    if (Number.isFinite(budget.max) && metric.max > budget.max) {
      failures.push(`metric ${name}.max ${metric.max.toFixed(1)} > ${budget.max}`);
    }
    if (Number.isFinite(budget.min) && metric.min < budget.min) {
      failures.push(`metric ${name}.min ${metric.min.toFixed(1)} < ${budget.min}`);
    }
  }

  return failures;
}

export function evaluateRegression(result, baseline, regression = {}) {
  if (!baseline) return [];

  const failures = [];
  const wallMsPct = Number(regression.wallMsPct ?? regression.maxWallMsPct ?? 0);
  const peakRssMbPct = Number(regression.peakRssMbPct ?? regression.maxPeakRssMbPct ?? 0);
  const metricsPct = Number(regression.metricsPct ?? regression.maxMetricsPct ?? 0);

  if (wallMsPct > 0 && Number.isFinite(baseline.wallMs) && result.wallMs > baseline.wallMs * (1 + wallMsPct / 100)) {
    failures.push(`wallMs ${result.wallMs.toFixed(1)} regressed > ${wallMsPct}% from baseline ${baseline.wallMs.toFixed(1)}`);
  }

  if (peakRssMbPct > 0 && Number.isFinite(baseline.peakRssMb) && Number.isFinite(result.peakRssMb) && result.peakRssMb > baseline.peakRssMb * (1 + peakRssMbPct / 100)) {
    failures.push(`peakRssMb ${result.peakRssMb.toFixed(1)} regressed > ${peakRssMbPct}% from baseline ${baseline.peakRssMb.toFixed(1)}`);
  }

  if (metricsPct > 0) {
    for (const [name, metric] of Object.entries(result.metrics || {})) {
      const baselineMetric = baseline.metrics?.[name];
      if (!baselineMetric || !Number.isFinite(metric.max) || !Number.isFinite(baselineMetric.max)) continue;
      if (metric.max > baselineMetric.max * (1 + metricsPct / 100)) {
        failures.push(`metric ${name}.max ${metric.max.toFixed(1)} regressed > ${metricsPct}% from baseline ${baselineMetric.max.toFixed(1)}`);
      }
    }
  }

  return failures;
}

export async function runScenarioFile(scenarioPath, options = {}) {
  const { scenario, scenarioDir } = loadScenario(scenarioPath);
  return runScenario(scenario, scenarioDir, options);
}

export async function runScenario(scenario, scenarioDir = repoRoot, options = {}) {
  const mode = options.mode || 'short';
  const config = resolveScenarioConfig(scenario, scenarioDir, mode);

  if (!PROCESS_TARGETS.has(config.target)) {
    throw new Error(`Unsupported perf target "${config.target}"`);
  }

  return runProcessTarget(config, options);
}

async function runProcessTarget(config, options = {}) {
  for (const step of config.preRun) {
    await runPreRunStep(step, config);
  }

  const artifactDir = prepareArtifactDir(config, options);
  const env = buildChildEnv(config, artifactDir);
  const startedAt = performance.now();
  const stdoutLines = [];
  const stderrLines = [];
  const metrics = {};
  const rssSamples = [];
  let timedOut = false;

  const child = spawn(config.command, config.args, {
    cwd: config.cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });

  const recordMetric = (name, value) => {
    if (!Number.isFinite(value)) return;
    const existing = metrics[name] || { count: 0, min: value, max: value, last: value };
    existing.count += 1;
    existing.min = Math.min(existing.min, value);
    existing.max = Math.max(existing.max, value);
    existing.last = value;
    metrics[name] = existing;
  };

  const consumeLine = (line, sink) => {
    if (!line) return;
    sink.push(line);
    if (sink.length > (options.maxOutputLines || 200)) {
      sink.shift();
    }
    try {
      const event = JSON.parse(line);
      if (event?.type === 'metric') {
        recordMetric(String(event.name || event.metric), Number(event.value));
      }
    } catch {
      // Non-JSON output is normal for perf scenarios.
    }
  };

  attachLineReader(child.stdout, line => consumeLine(line, stdoutLines));
  attachLineReader(child.stderr, line => consumeLine(line, stderrLines));

  const shouldCollectRss = config.collect.includes('rss') || config.collect.includes('memory');
  const sampleRss = async () => {
    if (!child.pid || !shouldCollectRss) return;
    const rssMb = await sampleProcessTreeRssMb(child.pid);
    if (rssMb != null) {
      rssSamples.push({ t: performance.now() - startedAt, rssMb });
    }
  };

  await sampleRss();
  const sampler = shouldCollectRss
    ? setInterval(() => void sampleRss(), Math.max(50, config.sampleIntervalMs))
    : null;

  let timeoutHandle = null;
  if (config.timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, config.timeoutMs);
  }

  const exit = await new Promise(resolve => {
    child.on('error', error => resolve({ error }));
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });

  if (sampler) clearInterval(sampler);
  if (timeoutHandle) clearTimeout(timeoutHandle);
  await sampleRss();

  const wallMs = performance.now() - startedAt;
  const peakRssMb = rssSamples.length
    ? Math.max(...rssSamples.map(sample => sample.rssMb))
    : null;

  const result = {
    scenario: config.name,
    target: config.target,
    mode: config.mode,
    command: config.command,
    args: config.args,
    cwd: config.cwd,
    wallMs,
    peakRssMb,
    rssSamples,
    metrics,
    artifactDir,
    artifacts: collectArtifactPaths(config, artifactDir),
    exitCode: exit.exitCode ?? null,
    signal: exit.signal ?? null,
    timedOut,
    error: exit.error ? String(exit.error.message || exit.error) : null,
    stdoutTail: stdoutLines,
    stderrTail: stderrLines
  };

  const budgetFailures = evaluateBudgets(result, config.budgets);
  const regressionFailures = evaluateRegression(result, options.baseline, config.regression);
  result.budgetFailures = budgetFailures;
  result.regressionFailures = regressionFailures;
  result.status = exit.error || timedOut || budgetFailures.length > 0 || regressionFailures.length > 0 ? 'fail' : 'pass';

  return result;
}

function prepareArtifactDir(config, options) {
  if (options.artifactDir === false) return null;
  const needsArtifacts = config.collect.some(name => ['trace', 'trace-memory', 'cpu', 'heap'].includes(name));
  const configured = options.artifactDir || config.artifactDir;
  if (!needsArtifacts && !configured) return null;

  const timestamp = new Date().toISOString().replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
  const template = configured || '.perf-results/{name}-{mode}-{timestamp}';
  const artifactDir = expandPath(
    template
      .replaceAll('{name}', config.name)
      .replaceAll('{mode}', config.mode)
      .replaceAll('{timestamp}', timestamp),
    config.cwd
  );
  mkdirSync(artifactDir, { recursive: true });
  return artifactDir;
}

function buildChildEnv(config, artifactDir) {
  const env = { ...process.env, ...config.env };
  const nodeOptions = [];

  if (env.NODE_OPTIONS) {
    nodeOptions.push(env.NODE_OPTIONS);
  }

  if (artifactDir && config.collect.includes('trace')) {
    env.MLLD_TRACE = env.MLLD_TRACE || 'verbose';
    env.MLLD_TRACE_FILE = env.MLLD_TRACE_FILE || path.join(artifactDir, 'runtime-trace.jsonl');
  }

  if (artifactDir && config.collect.includes('trace-memory')) {
    env.MLLD_TRACE = env.MLLD_TRACE || 'verbose';
    env.MLLD_TRACE_MEMORY = env.MLLD_TRACE_MEMORY || '1';
    env.MLLD_TRACE_FILE = env.MLLD_TRACE_FILE || path.join(artifactDir, 'runtime-trace.jsonl');
  }

  if (artifactDir && config.collect.includes('cpu')) {
    nodeOptions.push(`--cpu-prof-dir=${artifactDir}`, '--cpu-prof');
  }

  if (artifactDir && config.collect.includes('heap')) {
    nodeOptions.push(`--diagnostic-dir=${artifactDir}`, '--heapsnapshot-near-heap-limit=1');
  }

  if (nodeOptions.length > 0) {
    env.NODE_OPTIONS = nodeOptions.join(' ');
  }

  return env;
}

function collectArtifactPaths(config, artifactDir) {
  if (!artifactDir) return {};
  const artifacts = { dir: artifactDir };
  if (config.collect.includes('trace') || config.collect.includes('trace-memory')) {
    artifacts.traceFile = path.join(artifactDir, 'runtime-trace.jsonl');
  }
  return artifacts;
}

async function runPreRunStep(step, parentConfig) {
  const command = typeof step === 'string' ? step : step.command;
  const args = typeof step === 'string' ? [] : step.args || [];
  const cwd = expandPath(typeof step === 'string' ? parentConfig.cwd : step.cwd || parentConfig.cwd);
  const env = typeof step === 'string' ? parentConfig.env : { ...parentConfig.env, ...(step.env || {}) };
  const timeoutMs = typeof step === 'string' ? 0 : Number(step.timeoutMs || 0);

  if (!command) {
    throw new Error(`Invalid preRun step in scenario ${parentConfig.name}`);
  }

  await new Promise((resolve, reject) => {
    execFile(command, args, { cwd, env: { ...process.env, ...env }, timeout: timeoutMs || undefined }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`preRun failed: ${command} ${args.join(' ')}\n${stderr || stdout || error.message}`));
      } else {
        resolve();
      }
    });
  });
}

function attachLineReader(stream, onLine) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trimEnd();
      buffer = buffer.slice(index + 1);
      onLine(line);
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) {
      onLine(buffer.trimEnd());
    }
  });
}

async function sampleProcessTreeRssMb(rootPid) {
  const pids = await getProcessTreePids(rootPid);
  let totalKb = 0;
  for (const pid of pids) {
    const rssKb = sampleProcessRssKb(pid);
    if (rssKb != null) {
      totalKb += rssKb;
    }
  }
  return totalKb > 0 ? totalKb / 1024 : null;
}

async function getProcessTreePids(rootPid) {
  const seen = new Set();
  const queue = [Number(rootPid)];

  while (queue.length > 0) {
    const pid = queue.shift();
    if (!Number.isFinite(pid) || seen.has(pid)) continue;
    seen.add(pid);
    for (const childPid of listChildPids(pid)) {
      if (!seen.has(childPid)) queue.push(childPid);
    }
  }

  return [...seen];
}

function listChildPids(pid) {
  try {
    const output = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return output
      .split(/\s+/)
      .map(value => Number(value))
      .filter(Number.isFinite);
  } catch {
    return [];
  }
}

function sampleProcessRssKb(pid) {
  try {
    const output = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const rssKb = Number(output.trim());
    return Number.isFinite(rssKb) ? rssKb : null;
  } catch {
    return null;
  }
}

function killProcessTree(child) {
  if (!child.pid) return;
  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // The process may have already exited.
  }

  setTimeout(() => {
    try {
      if (process.platform !== 'win32') {
        process.kill(-child.pid, 'SIGKILL');
      } else {
        child.kill('SIGKILL');
      }
    } catch {
      // The process may have already exited.
    }
  }, 2000).unref();
}

function printHumanResult(result) {
  console.log(`${result.status.toUpperCase()} ${result.scenario} (${result.mode}, ${result.target})`);
  console.log(`  wall: ${result.wallMs.toFixed(1)}ms`);
  if (result.peakRssMb != null) {
    console.log(`  peak RSS: ${result.peakRssMb.toFixed(1)}MB`);
  }
  for (const [name, metric] of Object.entries(result.metrics || {})) {
    console.log(`  ${name}: max=${metric.max.toFixed(1)} min=${metric.min.toFixed(1)} last=${metric.last.toFixed(1)} count=${metric.count}`);
  }
  if (result.exitCode !== 0 || result.signal) {
    console.log(`  exit: code=${result.exitCode} signal=${result.signal || 'none'}`);
  }
  if (result.budgetFailures.length > 0) {
    console.log('  budget failures:');
    for (const failure of result.budgetFailures) {
      console.log(`    - ${failure}`);
    }
  }
  if (result.regressionFailures.length > 0) {
    console.log('  regression failures:');
    for (const failure of result.regressionFailures) {
      console.log(`    - ${failure}`);
    }
  }
  if (result.artifactDir) {
    console.log(`  artifacts: ${result.artifactDir}`);
  }
}

function parseArgs(argv) {
  const args = [...argv];
  if (args[0] === 'run') args.shift();

  const parsed = {
    scenarioPath: null,
    mode: 'short',
    json: false,
    save: false,
    output: null,
    baseline: null,
    artifactDir: null
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--mode') {
      parsed.mode = args.shift() || parsed.mode;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--save') {
      parsed.save = true;
    } else if (arg === '--output') {
      parsed.output = args.shift() || null;
    } else if (arg === '--baseline') {
      parsed.baseline = args.shift() || null;
    } else if (arg === '--artifact-dir') {
      parsed.artifactDir = args.shift() || null;
    } else if (!parsed.scenarioPath) {
      parsed.scenarioPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!parsed.scenarioPath) {
    throw new Error('Usage: node scripts/perf-harness.mjs <scenario.json> [--mode short|full] [--json] [--save] [--output result.json] [--baseline result.json] [--artifact-dir dir]');
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseline = args.baseline ? JSON.parse(readFileSync(expandPath(args.baseline, process.cwd()), 'utf8')) : null;
  const result = await runScenarioFile(args.scenarioPath, {
    mode: args.mode,
    baseline,
    artifactDir: args.artifactDir
  });
  const outputPath = resolveOutputPath(args, result);
  if (outputPath) {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result);
    if (outputPath) {
      console.log(`  result: ${outputPath}`);
    }
  }
  process.exitCode = result.status === 'pass' ? 0 : 1;
}

function resolveOutputPath(args, result) {
  if (args.output) {
    return expandPath(args.output, process.cwd());
  }
  if (!args.save) {
    return null;
  }
  const timestamp = new Date().toISOString().replaceAll(':', '').replace(/\.\d+Z$/, 'Z');
  return path.join(repoRoot, '.perf-results', `${result.scenario}-${result.mode}-${timestamp}.json`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
}
