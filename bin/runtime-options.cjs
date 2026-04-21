const fs = require('fs');
const os = require('os');
const path = require('path');

const HEAP_FLAG = '--mlld-heap';
const HEAP_SNAPSHOT_FLAG = '--heap-snapshot-near-limit';

function parseMemoryToMb(raw, optionName = HEAP_FLAG) {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  const value = String(raw).trim().toLowerCase();
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(m|mb|g|gb)?$/);
  if (!match) {
    throw new Error(`${optionName} must be a positive memory size like 8192, 8192m, or 8g`);
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${optionName} must be a positive memory size`);
  }

  const unit = match[2] ?? 'mb';
  const mb = unit === 'g' || unit === 'gb' ? amount * 1024 : amount;
  if (!Number.isFinite(mb) || mb < 1) {
    throw new Error(`${optionName} must resolve to at least 1 MB`);
  }

  return Math.round(mb);
}

function parsePositiveInteger(raw, optionName) {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const value = Number(String(raw).trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive integer`);
  }
  return value;
}

function extractWrapperRuntimeArgs(args) {
  const strippedArgs = [];
  let heap;
  let heapSnapshotNearLimit;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === HEAP_FLAG) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new Error(`${HEAP_FLAG} requires a value`);
      }
      heap = next;
      index++;
      continue;
    }

    if (arg.startsWith(`${HEAP_FLAG}=`)) {
      heap = arg.slice(HEAP_FLAG.length + 1);
      continue;
    }

    if (arg === HEAP_SNAPSHOT_FLAG) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new Error(`${HEAP_SNAPSHOT_FLAG} requires a value`);
      }
      heapSnapshotNearLimit = next;
      index++;
      continue;
    }

    if (arg.startsWith(`${HEAP_SNAPSHOT_FLAG}=`)) {
      heapSnapshotNearLimit = arg.slice(HEAP_SNAPSHOT_FLAG.length + 1);
      continue;
    }

    strippedArgs.push(arg);
  }

  return {
    args: strippedArgs,
    heap,
    heapSnapshotNearLimit
  };
}

function findProjectConfigPath(startDir = process.cwd()) {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, 'mlld-config.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function getGlobalConfigPath() {
  if (process.env.MLLD_CONFIG_HOME) {
    return path.join(process.env.MLLD_CONFIG_HOME, 'mlld-config.json');
  }
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'mlld', 'mlld-config.json');
  }
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'mlld', 'mlld-config.json');
  }
  return path.join(os.homedir(), '.config', 'mlld', 'mlld-config.json');
}

function readRuntimeConfig(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const runtime = parsed && typeof parsed === 'object' ? parsed.runtime : undefined;
    return runtime && typeof runtime === 'object' && !Array.isArray(runtime) ? runtime : {};
  } catch {
    return {};
  }
}

function resolveConfiguredHeap(cwd = process.cwd()) {
  const globalRuntime = readRuntimeConfig(getGlobalConfigPath());
  const projectRuntime = readRuntimeConfig(findProjectConfigPath(cwd));
  return projectRuntime.heap ?? globalRuntime.heap;
}

function buildNodeRuntimeArgs(options = {}) {
  const nodeArgs = [];
  const heapValue = options.heap ?? process.env.MLLD_HEAP ?? resolveConfiguredHeap(options.cwd);
  const heapMb = parseMemoryToMb(heapValue);
  if (heapMb !== undefined) {
    nodeArgs.push(`--max-old-space-size=${heapMb}`);
  }

  const snapshotCount = parsePositiveInteger(
    options.heapSnapshotNearLimit,
    HEAP_SNAPSHOT_FLAG
  );
  if (snapshotCount !== undefined) {
    nodeArgs.push(`--heapsnapshot-near-heap-limit=${snapshotCount}`);
  }

  return nodeArgs;
}

module.exports = {
  buildNodeRuntimeArgs,
  extractWrapperRuntimeArgs,
  parseMemoryToMb,
  readRuntimeConfig,
  resolveConfiguredHeap
};
