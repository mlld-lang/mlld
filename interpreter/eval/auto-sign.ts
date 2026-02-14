import type { Environment } from '../env/Environment';
import type { Variable } from '@core/types/variable';
import { PersistentContentStore } from '@disreguard/sig';
import { createSigContextForEnv } from '@core/security/sig-adapter';
import { matchesAnyVariablePattern } from '@core/security/variable-glob';
import { getSignatureContent } from './sign-verify';
import { isStructuredValue } from '@interpreter/utils/structured-value';

type AutosignConfig = {
  signTemplates: boolean;
  signAllVariables: boolean;
  variablePatterns: string[];
};

function collectAutosignEntries(entries: string[], config: AutosignConfig): void {
  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (trimmed === 'templates') {
      config.signTemplates = true;
    } else if (trimmed === 'variables') {
      config.signAllVariables = true;
    } else {
      config.variablePatterns.push(trimmed);
    }
  }
}

function resolveAutosignConfig(value: unknown): AutosignConfig | null {
  if (value === undefined || value === null) {
    return null;
  }
  const config: AutosignConfig = {
    signTemplates: false,
    signAllVariables: false,
    variablePatterns: []
  };
  if (Array.isArray(value)) {
    collectAutosignEntries(value, config);
  } else if (typeof value === 'string') {
    collectAutosignEntries([value], config);
  } else if (typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    if (raw.templates === true) {
      config.signTemplates = true;
    }
    if (raw.variables === true) {
      config.signAllVariables = true;
    } else if (Array.isArray(raw.variables)) {
      collectAutosignEntries(raw.variables as string[], config);
    } else if (typeof raw.variables === 'string') {
      collectAutosignEntries([raw.variables], config);
    }
  }
  if (!config.signTemplates && !config.signAllVariables && config.variablePatterns.length === 0) {
    return null;
  }
  return config;
}

function hasTemplateExtension(filePath?: string): boolean {
  if (!filePath) {
    return false;
  }
  const lower = filePath.toLowerCase();
  return lower.endsWith('.att') || lower.endsWith('.mtt');
}

function getStructuredSourcePath(variable: Variable): string | undefined {
  const internal = variable.internal as any;
  const internalMetadata =
    internal?.structuredValueMetadata && typeof internal.structuredValueMetadata === 'object'
      ? internal.structuredValueMetadata
      : undefined;
  const structuredMetadata =
    internalMetadata ??
    (isStructuredValue(variable.value) ? variable.value.metadata : undefined) ??
    (internal && typeof internal === 'object' ? internal : undefined);
  if (!structuredMetadata || typeof structuredMetadata !== 'object') {
    return undefined;
  }
  const candidate =
    (structuredMetadata as any).filename ??
    (structuredMetadata as any).relative ??
    (structuredMetadata as any).absolute;
  return typeof candidate === 'string' ? candidate : undefined;
}

function isTemplateCategoryVariable(variable: Variable): boolean {
  if (variable.type === 'template') {
    return true;
  }
  if (variable.type === 'executable') {
    const execDef = (variable.internal as any)?.executableDef;
    if (execDef && typeof execDef === 'object' && execDef.type === 'template') {
      return true;
    }
  }
  if (variable.type === 'file-content' || variable.type === 'section-content') {
    return hasTemplateExtension(variable.filePath);
  }
  if (variable.type === 'structured') {
    const sourcePath = getStructuredSourcePath(variable);
    return hasTemplateExtension(sourcePath);
  }
  return false;
}

export async function maybeAutosignVariable(
  identifier: string,
  variable: Variable,
  env: Environment
): Promise<void> {
  const autosign = env.getPolicySummary()?.defaults?.autosign;
  const config = resolveAutosignConfig(autosign);
  if (!config) {
    return;
  }
  const matchesTemplate = config.signTemplates && isTemplateCategoryVariable(variable);
  const matchesVariables =
    config.signAllVariables ||
    (config.variablePatterns.length > 0 &&
      matchesAnyVariablePattern(identifier, config.variablePatterns));
  if (!matchesTemplate && !matchesVariables) {
    return;
  }
  const store = new PersistentContentStore(createSigContextForEnv(env));
  const content = getSignatureContent(variable);
  await store.signIfChanged(content, { id: identifier });
}
