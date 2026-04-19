import * as path from 'path';
import { normalizeProjectName } from '@core/utils/project-name';

export const DEFAULT_SCRIPT_DIR = 'llm/run';
export const DEFAULT_LOCAL_MODULES_PATH = './llm/modules';
export const DEFAULT_TRUSTED_DOMAINS = [
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'api.github.com'
] as const;

export interface DefaultProjectConfig {
  version: 1;
  projectname: string;
  scriptDir: string;
  resolvers: {
    prefixes: Array<{
      prefix: '@local/';
      resolver: 'LOCAL';
      type: 'input';
      priority: 20;
      config: {
        basePath: string;
      };
    }>;
  };
  trustedDomains: string[];
}

export interface DefaultProjectConfigOptions {
  projectRoot: string;
  scriptDir?: string;
  localPath?: string;
}

export function createDefaultProjectConfig(
  options: DefaultProjectConfigOptions
): DefaultProjectConfig {
  const resolvedProjectRoot = path.resolve(options.projectRoot);
  const projectname =
    normalizeProjectName(path.basename(resolvedProjectRoot)) || 'mlld-project';

  return {
    version: 1,
    projectname,
    scriptDir: options.scriptDir || DEFAULT_SCRIPT_DIR,
    resolvers: {
      prefixes: [
        {
          prefix: '@local/',
          resolver: 'LOCAL',
          type: 'input',
          priority: 20,
          config: {
            basePath: options.localPath || DEFAULT_LOCAL_MODULES_PATH
          }
        }
      ]
    },
    trustedDomains: [...DEFAULT_TRUSTED_DOMAINS]
  };
}
