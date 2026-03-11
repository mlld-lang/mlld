import type { SourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import { enforceFilesystemAccess } from '@interpreter/policy/filesystem-policy';
import { resolveWorkspacePathReference } from '@interpreter/utils/workspace-reference';

export class PolicyAwareReadHelper {
  async read(
    pathOrUrl: string,
    env: Environment,
    sourceLocation?: SourceLocation
  ): Promise<string> {
    if (env.isURL(pathOrUrl)) {
      return env.readFile(pathOrUrl);
    }

    const workspaceReference = await resolveWorkspacePathReference(pathOrUrl, env);
    if (workspaceReference) {
      enforceFilesystemAccess(env, 'read', workspaceReference.absolutePath, sourceLocation);
      return workspaceReference.workspace.fs.readFile(workspaceReference.absolutePath);
    }

    const resolvedPath = await env.resolvePath(pathOrUrl);
    enforceFilesystemAccess(env, 'read', resolvedPath, sourceLocation);
    return env.readFile(resolvedPath);
  }
}
