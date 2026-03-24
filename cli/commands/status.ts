import path from 'node:path';
import { mergePolicyConfigs, normalizePolicyConfig, type PolicyConfig } from '@core/policy/union';
import { SigService } from '@core/security';
import type { SigStatusEntry } from '@core/security/file-status';
import { listStatusTargets, toSigStatusEntry } from '@core/security/file-status';
import { interpret } from '@interpreter/index';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { getCommandContext } from '../utils/command-context';

export interface StatusOptions {
  basePath?: string;
  glob?: string;
  json?: boolean;
  taint?: boolean;
}

const POLICY_CONFIG_KEYS = new Set<keyof PolicyConfig>([
  'verify_all_instructions',
  'defaults',
  'default',
  'auth',
  'keychain',
  'allow',
  'deny',
  'deny_cmd',
  'danger',
  'capabilities',
  'labels',
  'operations',
  'signers',
  'filesystem_integrity',
  'env',
  'limits'
]);

function isPolicyConfigLike(value: unknown): value is PolicyConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.keys(value as Record<string, unknown>).some((key) =>
    POLICY_CONFIG_KEYS.has(key as keyof PolicyConfig)
  );
}

function collectPolicyConfigsFromNamespace(namespaceValue: unknown): PolicyConfig[] {
  const configs: PolicyConfig[] = [];
  const seen = new Set<string>();

  const addConfig = (candidate: unknown): void => {
    if (!isPolicyConfigLike(candidate)) {
      return;
    }

    const normalized = normalizePolicyConfig(candidate);
    const signature = JSON.stringify(normalized);
    if (seen.has(signature)) {
      return;
    }
    seen.add(signature);
    configs.push(normalized);
  };

  addConfig(namespaceValue);

  if (!namespaceValue || typeof namespaceValue !== 'object' || Array.isArray(namespaceValue)) {
    return configs;
  }

  const namespaceRecord = namespaceValue as Record<string, unknown>;
  addConfig(namespaceRecord.config);

  for (const exportedValue of Object.values(namespaceRecord)) {
    addConfig(exportedValue);
  }

  return configs;
}

async function loadProjectPolicySummary(
  projectRoot: string,
  currentDir: string,
  fileSystem: NodeFileSystem,
  pathService: PathService
): Promise<PolicyConfig | undefined> {
  const configPath = path.join(projectRoot, 'mlld-config.json');
  const hasConfig = await fileSystem.exists(configPath).catch(() => false);
  if (!hasConfig) {
    return undefined;
  }

  const configEnv = new Environment(
    fileSystem,
    pathService,
    {
      projectRoot,
      fileDirectory: projectRoot,
      executionDirectory: projectRoot,
      invocationDirectory: currentDir,
      filePath: configPath
    }
  );
  const projectConfig = configEnv.getProjectConfig?.();
  const policyImports = projectConfig?.getPolicyImports?.() ?? [];
  if (policyImports.length === 0) {
    return undefined;
  }

  const statusScriptPath = path.join(projectRoot, '__mlld_status__.mld');
  const aliases = policyImports.map((_, index) => `__status_policy_${index}`);
  const source = policyImports
    .map((reference, index) => `/import "${reference}" as @${aliases[index]}`)
    .join('\n');

  const result = await interpret(source, {
    fileSystem,
    pathService,
    filePath: statusScriptPath,
    pathContext: {
      projectRoot,
      fileDirectory: currentDir,
      executionDirectory: currentDir,
      invocationDirectory: currentDir,
      filePath: statusScriptPath
    },
    mode: 'structured',
    format: 'markdown',
    streaming: { enabled: false },
    recordEffects: false,
    approveAllImports: true
  });

  const environment = (result as {
    environment?: {
      getPolicySummary?: () => PolicyConfig | undefined;
      getVariableValue?: (name: string) => unknown;
      cleanup?: () => void;
    };
  }).environment;
  try {
    let merged = environment?.getPolicySummary?.();
    for (const alias of aliases) {
      const namespaceValue = environment?.getVariableValue?.(alias);
      for (const config of collectPolicyConfigsFromNamespace(namespaceValue)) {
        merged = mergePolicyConfigs(merged, config);
      }
    }
    return merged;
  } finally {
    environment?.cleanup?.();
  }
}

export async function collectFilesystemStatus(
  options: StatusOptions = {}
): Promise<SigStatusEntry[]> {
  const context = await getCommandContext({ startPath: options.basePath });
  const fileSystem = new NodeFileSystem();
  const pathService = new PathService();
  const policy = await loadProjectPolicySummary(
    context.projectRoot,
    context.currentDir,
    fileSystem,
    pathService
  );
  const sigService = new SigService(context.projectRoot, fileSystem);
  const targets = await listStatusTargets({
    fileSystem,
    projectRoot: context.projectRoot,
    policy,
    sigService,
    filterPattern: options.glob,
    basePath: context.currentDir
  });

  const statuses = await Promise.all(
    targets.map(async (filePath) => {
      const verifyResult = await sigService.check(filePath);
      return toSigStatusEntry(verifyResult, policy);
    })
  );

  return statuses.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function formatStatusLine(entry: SigStatusEntry): string {
  return `${entry.status.padEnd(9)} ${String(entry.signer ?? '-').padEnd(20)} ${entry.relativePath}`;
}

export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  const entries = await collectFilesystemStatus(options);
  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log('No tracked files found.');
    return;
  }

  for (const entry of entries) {
    console.log(formatStatusLine(entry));
    if (options.taint && entry.taint.length > 0) {
      console.log(`  taint: ${entry.taint.join(', ')}`);
    }
  }
}

export function createStatusCommand() {
  return {
    name: 'status',
    description: 'Show filesystem signature and integrity status',

    async execute(_args: string[], flags: Record<string, any> = {}): Promise<void> {
      await statusCommand({
        basePath: flags['base-path'] || process.cwd(),
        glob: typeof flags.glob === 'string' ? flags.glob : undefined,
        json: flags.json === true,
        taint: flags.taint === true
      });
    }
  };
}
