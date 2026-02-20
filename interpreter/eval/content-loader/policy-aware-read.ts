import type { SourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import { enforceFilesystemAccess } from '@interpreter/policy/filesystem-policy';

export class PolicyAwareReadHelper {
  async read(
    pathOrUrl: string,
    env: Environment,
    sourceLocation?: SourceLocation
  ): Promise<string> {
    if (env.isURL(pathOrUrl)) {
      return env.readFile(pathOrUrl);
    }
    const resolvedPath = await env.resolvePath(pathOrUrl);
    enforceFilesystemAccess(env, 'read', resolvedPath, sourceLocation);
    return env.readFile(resolvedPath);
  }
}
