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
    // Return an object with methods that can be invoked
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

    const metadata = {
      source: 'keychain',
      labels: ['secret']
    };

    return {
      content: keychainObject,
      contentType: 'data',
      mx: metadata,
      metadata
    };
  }
}
