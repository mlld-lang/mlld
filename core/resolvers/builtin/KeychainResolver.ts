import {
  Resolver,
  ResolverContent,
  ResolverCapabilities
} from '@core/resolvers/types';
import { MlldInterpreterError } from '@core/errors';

export interface KeychainProvider {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, value: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
  list(service: string): Promise<string[]>;
}

let provider: KeychainProvider | null = null;

export function getKeychainProvider(): KeychainProvider {
  if (!provider) {
    if (process.platform !== 'darwin') {
      throw new MlldInterpreterError(
        'Keychain requires macOS. Linux support planned for v1.1.',
        { code: 'KEYCHAIN_UNAVAILABLE' }
      );
    }
    // Import MacOS provider lazily
    const { MacOSKeychainProvider } = require('./keychain-macos');
    provider = new MacOSKeychainProvider();
  }
  return provider;
}

/**
 * Built-in resolver for keychain access.
 * Provides @keychain.get(service, account), @keychain.set(service, account, value),
 * and @keychain.delete(service, account) methods.
 */
export class KeychainResolver implements Resolver {
  name = 'keychain';
  description = 'Provides secure credential storage via system keychain';
  type = 'input' as const;

  capabilities: ResolverCapabilities = {
    io: { read: true, write: true, list: false },
    contexts: { import: true, path: false, output: false },
    supportedContentTypes: ['data'],
    defaultContentType: 'data',
    priority: 1,
    cache: { strategy: 'none' }
  };

  canResolve(ref: string): boolean {
    const cleanRef = ref.replace(/^@/, '');
    return cleanRef === 'keychain';
  }

  async resolve(ref: string, config?: any): Promise<ResolverContent> {
    const metadata = {
      source: 'keychain',
      labels: ['secret'] as string[]
    };

    // Import context - return executable exports for /import { get, set, delete } from @keychain
    if (config?.context === 'import') {
      const exports: Record<string, any> = {};
      const requestedImports = config.requestedImports || ['get', 'set', 'delete'];

      for (const importName of requestedImports) {
        if (importName === 'get') {
          exports.get = this.createKeychainExecutable('get', ['service', 'account'],
            async (args: any[]) => {
              const [service, account] = args;
              const provider = getKeychainProvider();
              return provider.get(service, account);
            }
          );
        } else if (importName === 'set') {
          exports.set = this.createKeychainExecutable('set', ['service', 'account', 'value'],
            async (args: any[]) => {
              const [service, account, value] = args;
              const provider = getKeychainProvider();
              await provider.set(service, account, value);
              return undefined;
            }
          );
        } else if (importName === 'delete') {
          // 'delete' is a reserved word, use 'remove' as alias
          exports.delete = this.createKeychainExecutable('delete', ['service', 'account'],
            async (args: any[]) => {
              const [service, account] = args;
              const provider = getKeychainProvider();
              await provider.delete(service, account);
              return undefined;
            }
          );
        }
      }

      return {
        content: exports,
        contentType: 'data',
        mx: metadata,
        metadata
      };
    }

    // Variable context - return an object with methods (for @keychain.get() style)
    const keychainObject = {
      get: async (service: string, account: string): Promise<string | null> => {
        const provider = getKeychainProvider();
        return provider.get(service, account);
      },
      set: async (service: string, account: string, value: string): Promise<void> => {
        const provider = getKeychainProvider();
        return provider.set(service, account, value);
      },
      delete: async (service: string, account: string): Promise<void> => {
        const provider = getKeychainProvider();
        return provider.delete(service, account);
      }
    };

    return {
      content: keychainObject,
      contentType: 'data',
      mx: metadata,
      metadata
    };
  }

  /**
   * Create an executable object for keychain functions that can be imported
   */
  private createKeychainExecutable(
    name: string,
    paramNames: string[],
    implementation: (args: any[]) => Promise<any>
  ): any {
    return {
      __executable: true,
      value: {
        type: 'code',
        codeTemplate: [{ type: 'Text', content: `// keychain.${name}` }],
        language: 'javascript',
        paramNames,
        sourceDirective: 'exec'
      },
      executableDef: {
        type: 'code',
        codeTemplate: [{ type: 'Text', content: `// keychain.${name}` }],
        language: 'javascript',
        paramNames,
        sourceDirective: 'exec'
      },
      internal: {
        isBuiltinTransformer: true,
        transformerImplementation: implementation,
        keychainFunction: name,
        description: `Keychain ${name} operation`
      }
    };
  }
}
