import path from 'node:path';
import type { Environment } from '@interpreter/env/Environment';
import type { WorkspaceValue } from '@core/types/workspace';
import { isWorkspaceValue } from '@core/types/workspace';
import { extractVariableValue } from './variable-resolution';

const WORKSPACE_REFERENCE_PATTERN = /^@([A-Za-z_][A-Za-z0-9_]*)(?:\/(.*))?$/;

export interface WorkspacePathReference {
  variableName: string;
  relativePath: string;
  absolutePath: string;
  workspace: WorkspaceValue;
}

function normalizeRelativeWorkspacePath(rawPath: string): string {
  const normalized = path.posix.normalize(String(rawPath ?? '').replace(/\\/g, '/'));
  if (!normalized || normalized === '.') {
    return '';
  }
  const segments = normalized.split('/').filter(Boolean);
  if (segments.includes('..')) {
    throw new Error("Workspace path references cannot contain '..'.");
  }
  return normalized;
}

export async function resolveWorkspaceFromVariable(
  variableName: string,
  env: Environment
): Promise<WorkspaceValue | undefined> {
  const local = env.getVariable(variableName);
  if (local) {
    const value = await extractVariableValue(local, env);
    if (isWorkspaceValue(value)) {
      return value;
    }
  }

  const resolverVariable = await env.getResolverVariable(variableName);
  if (!resolverVariable) {
    return undefined;
  }
  const resolverValue = await extractVariableValue(resolverVariable, env);
  if (isWorkspaceValue(resolverValue)) {
    return resolverValue;
  }
  return undefined;
}

export async function resolveWorkspacePathReference(
  pathOrUrl: string,
  env: Environment
): Promise<WorkspacePathReference | undefined> {
  const match = WORKSPACE_REFERENCE_PATTERN.exec(String(pathOrUrl ?? '').trim());
  if (!match) {
    return undefined;
  }

  const variableName = match[1] as string;
  const rawRelativePath = match[2] ?? '';
  const workspace = await resolveWorkspaceFromVariable(variableName, env);
  if (!workspace) {
    return undefined;
  }

  const relativePath = normalizeRelativeWorkspacePath(rawRelativePath);
  const projectRoot = String(env.getProjectRoot() || '/').replace(/\\/g, '/');
  const absolutePath = path.posix.join(projectRoot, relativePath);

  return {
    variableName,
    relativePath,
    absolutePath,
    workspace
  };
}
