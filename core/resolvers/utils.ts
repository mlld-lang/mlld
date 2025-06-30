import { PrefixConfig } from '@core/resolvers/types';

/**
 * Create default resolver configs if no lock file exists
 */
export function getDefaultResolverConfigs(): PrefixConfig[] {
  return [
    // Example: Local notes directory
    {
      prefix: '@notes/',
      resolver: 'local',
      type: 'io',
      config: {
        basePath: '~/notes',
        allowedExtensions: ['.mld', '.md'],
        readonly: false
      },
      description: 'Local notes directory'
    },
    // Example: Company modules via GitHub
    {
      prefix: '@company/',
      resolver: 'github',
      type: 'input',
      config: {
        repository: 'company/mlld-modules',
        branch: 'main',
        basePath: 'modules'
      },
      description: 'Company modules repository'
    }
  ];
}