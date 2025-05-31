import { RegistryConfig } from '@core/resolvers/types';
import { RegistryEntry } from '@core/registry/LockFile';

/**
 * Convert lock file registry entries to resolver registry configs
 */
export function convertLockFileToResolverConfigs(
  lockFileRegistries: Record<string, RegistryEntry>
): RegistryConfig[] {
  const configs: RegistryConfig[] = [];

  for (const [name, entry] of Object.entries(lockFileRegistries)) {
    // Skip entries without resolver or patterns
    if (!entry.resolver || (!entry.patterns && !entry.url)) {
      continue;
    }

    // Convert each pattern to a registry config
    if (entry.patterns) {
      for (const pattern of entry.patterns) {
        configs.push({
          prefix: pattern,
          resolver: entry.resolver,
          type: entry.type || 'input',
          config: entry.config,
          description: `Registry: ${name}`
        });
      }
    } else if (entry.url) {
      // Legacy format with URL - use a default pattern
      configs.push({
        prefix: `@${name}/`,
        resolver: entry.resolver,
        type: entry.type || 'input',
        config: entry.config,
        description: `Registry: ${name}`
      });
    }
  }

  // Sort by priority if available
  return configs.sort((a, b) => {
    const priorityA = lockFileRegistries[a.description?.replace('Registry: ', '') || '']?.priority ?? 999;
    const priorityB = lockFileRegistries[b.description?.replace('Registry: ', '') || '']?.priority ?? 999;
    return priorityA - priorityB;
  });
}

/**
 * Create default resolver configs if no lock file exists
 */
export function getDefaultResolverConfigs(): RegistryConfig[] {
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