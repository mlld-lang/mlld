/**
 * GitHub Authentication Service for mlld CLI
 * Implements OAuth Device Flow with secure token storage
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MlldError, ErrorSeverity } from '@core/errors';

export interface AuthConfig {
  clientId?: string;
  serviceName?: string;
  accountName?: string;
  fallbackStorage?: boolean;
}

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
  avatar_url: string;
  type: string;
}

export interface DeviceFlowResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface AuthResult {
  success: boolean;
  user?: GitHubUser;
  token?: string;
  error?: string;
}

export class GitHubAuthService {
  private static instance: GitHubAuthService | null = null;
  private config: AuthConfig;
  private serviceName: string;
  private accountName: string;
  private fallbackTokenPath: string;
  private clientId: string;
  private octokitModule: any;
  private keytarModule: any = undefined;

  constructor(config: AuthConfig = {}) {
    this.config = {
      clientId: process.env.MLLD_GITHUB_CLIENT_ID || 'Ov23liFeqioeJmD9xZOP',
      serviceName: 'mlld-cli',
      accountName: 'github-token',
      fallbackStorage: true,
      ...config
    };
    
    this.clientId = this.config.clientId!;
    this.serviceName = this.config.serviceName!;
    this.accountName = this.config.accountName!;
    this.fallbackTokenPath = path.join(os.homedir(), '.mlld', 'auth.json');
  }

  /**
   * Get singleton instance of GitHubAuthService
   */
  static getInstance(config?: AuthConfig): GitHubAuthService {
    if (!GitHubAuthService.instance) {
      GitHubAuthService.instance = new GitHubAuthService(config);
    }
    return GitHubAuthService.instance;
  }

  /**
   * Dynamically load keytar module (optional dependency)
   */
  private async getKeytarModule() {
    if (this.keytarModule === undefined) {
      try {
        this.keytarModule = await import('keytar');
      } catch {
        this.keytarModule = null;
      }
    }
    return this.keytarModule;
  }

  /**
   * Dynamically load Octokit module
   */
  private async getOctokitModule() {
    if (!this.octokitModule) {
      this.octokitModule = await import('@octokit/rest');
    }
    return this.octokitModule;
  }

  /**
   * Get authenticated Octokit instance
   */
  async getOctokit(): Promise<any> {
    const token = await this.getStoredToken();
    if (!token) {
      throw new MlldError('Not authenticated. Please run: mlld auth login', {
        code: 'AUTH_NOT_AUTHENTICATED',
        severity: ErrorSeverity.Fatal
      });
    }
    const { Octokit } = await this.getOctokitModule();
    return new Octokit({ 
      auth: token,
      log: {
        debug: () => {},
        info: () => {},
        warn: console.warn,
        error: console.error
      }
    });
  }

  /**
   * Check if user is currently authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await this.getStoredToken();
      if (!token) return false;

      // Validate token with GitHub API
      const { Octokit } = await this.getOctokitModule();
      const octokit = new Octokit({ 
        auth: token,
        log: {
          debug: () => {},
          info: () => {},
          warn: console.warn,
          error: console.error
        }
      });
      await octokit.users.getAuthenticated();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current authenticated GitHub user
   */
  async getGitHubUser(): Promise<GitHubUser | null> {
    try {
      const octokit = await this.getOctokit();
      const { data } = await octokit.users.getAuthenticated();
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Perform authentication using OAuth Device Flow
   */
  async authenticate(): Promise<AuthResult> {
    try {
      // Check if already authenticated
      const existingUser = await this.getGitHubUser();
      if (existingUser) {
        return {
          success: true,
          user: existingUser,
          token: await this.getStoredToken()
        };
      }

      // Start device flow
      console.log('🔐 Starting GitHub authentication...\n');
      console.log('📄 By publishing to the mlld registry, you agree to license your');
      console.log('   modules under the CC0 1.0 Universal (CC0 1.0) Public Domain Dedication.');
      console.log('   Learn more: https://creativecommons.org/public-domain/cc0/\n');
      
      const deviceFlow = await this.initiateDeviceFlow();
      
      console.log(`Please visit: ${deviceFlow.verification_uri}`);
      console.log(`And enter code: ${deviceFlow.user_code}\n`);
      if (deviceFlow.verification_uri_complete) {
        console.log('Or open the direct link:');
        console.log(`${deviceFlow.verification_uri_complete}\n`);
      }
      console.log('Waiting for authentication...');

      // Poll for token
      const result = await this.pollForToken(deviceFlow);
      
      if (result.success) {
        console.log(`✅ Successfully authenticated as ${result.user!.login}`);
        return result;
      } else {
        console.error(`❌ Authentication failed: ${result.error}`);
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Authentication failed: ${errorMessage}`
      };
    }
  }

  /**
   * Logout - remove stored credentials
   */
  async logout(): Promise<void> {
    try {
      // Remove from keychain
      const keytar = await this.getKeytarModule();
      if (keytar) {
        try {
          await keytar.deletePassword(this.serviceName, this.accountName);
        } catch {
          // Keychain removal failed, continue to fallback
        }
      }

      // Remove fallback file
      if (this.config.fallbackStorage) {
        try {
          await fs.unlink(this.fallbackTokenPath);
        } catch {
          // File doesn't exist or can't be removed
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MlldError(`Logout failed: ${errorMessage}`, {
        code: 'AUTH_LOGOUT_FAILED',
        severity: ErrorSeverity.Fatal
      });
    }
  }

  /**
   * Get stored authentication token
   */
  async getStoredToken(): Promise<string | null> {
    // Try keychain first
    const keytar = await this.getKeytarModule();
    if (keytar) {
      try {
        const token = await keytar.getPassword(this.serviceName, this.accountName);
        if (token) return token;
      } catch {
        // Keychain access failed, try fallback
      }
    }

    // Try fallback storage
    if (this.config.fallbackStorage) {
      try {
        const authData = await fs.readFile(this.fallbackTokenPath, 'utf8');
        const parsed = JSON.parse(authData);
        return parsed.token || null;
      } catch {
        // Fallback file doesn't exist or is invalid
      }
    }

    return null;
  }

  /**
   * Store authentication token securely
   */
  private async storeToken(token: string): Promise<void> {
    let storedInKeychain = false;

    // Try to store in keychain
    const keytar = await this.getKeytarModule();
    if (keytar) {
      try {
        await keytar.setPassword(this.serviceName, this.accountName, token);
        storedInKeychain = true;
      } catch (error) {
        console.warn('⚠️  Could not store token in system keychain, using fallback storage');
      }
    } else {
      console.warn('⚠️  Keytar not available, using fallback storage');
    }

    // Store in fallback if keychain failed or if fallback is enabled
    if (!storedInKeychain && this.config.fallbackStorage) {
      try {
        // Ensure directory exists
        await fs.mkdir(path.dirname(this.fallbackTokenPath), { recursive: true });
        
        // Store token with metadata
        const authData = {
          token,
          stored_at: new Date().toISOString(),
          service: this.serviceName,
        };
        
        await fs.writeFile(
          this.fallbackTokenPath, 
          JSON.stringify(authData, null, 2),
          { mode: 0o600 } // Readable only by owner
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new MlldError(`Failed to store authentication token: ${errorMessage}`, {
          code: 'AUTH_TOKEN_STORAGE_FAILED',
          severity: ErrorSeverity.Fatal
        });
      }
    }
  }


  /**
   * Initiate GitHub OAuth Device Flow
   */
  private async initiateDeviceFlow(): Promise<DeviceFlowResult> {
    try {
      const response = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          scope: 'gist public_repo',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new MlldError(`Failed to initiate device flow: ${error}`, {
          code: 'AUTH_DEVICE_FLOW_FAILED',
          severity: ErrorSeverity.Fatal
        });
      }

      return await response.json();
    } catch (error) {
      if (error instanceof MlldError) {
        throw error;
      }
      throw new MlldError(`Failed to initiate device flow: ${error instanceof Error ? error.message : String(error)}`, {
        code: 'AUTH_DEVICE_FLOW_ERROR',
        severity: ErrorSeverity.Fatal,
        cause: error
      });
    }
  }

  /**
   * Poll for authentication token
   */
  private async pollForToken(deviceFlow: DeviceFlowResult): Promise<AuthResult> {
    const startTime = Date.now();
    const expirationTime = startTime + (deviceFlow.expires_in * 1000);
    let interval = deviceFlow.interval * 1000; // Convert to milliseconds

    while (Date.now() < expirationTime) {
      await this.sleep(interval);

      try {
        const response = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: this.clientId,
            device_code: deviceFlow.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });

        const data = await response.json();
        
        if (data.access_token) {
          // Store the token
          await this.storeToken(data.access_token);
          
          // Get user info
          const { Octokit } = await this.getOctokitModule();
          const octokit = new Octokit({ 
            auth: data.access_token,
            log: {
              debug: () => {},
              info: () => {},
              warn: console.warn,
              error: console.error
            }
          });
          const { data: user } = await octokit.users.getAuthenticated();
          
          return {
            success: true,
            user,
            token: data.access_token,
          };
        } else if (data.error === 'authorization_pending') {
          // Continue polling
          continue;
        } else if (data.error === 'slow_down') {
          // Increase polling interval
          interval += 5000;
          continue;
        } else if (data.error === 'access_denied') {
          return {
            success: false,
            error: 'Authentication was denied by user',
          };
        } else if (data.error === 'expired_token') {
          return {
            success: false,
            error: 'Authentication code expired. Please try again.',
          };
        } else {
          return {
            success: false,
            error: data.error_description || data.error || 'Unknown error',
          };
        }
      } catch (error) {
        // Network error - continue polling unless we're close to expiration
        if (Date.now() + interval >= expirationTime) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: `Network error during authentication: ${errorMessage}`,
          };
        }
        // Otherwise continue polling
      }
    }

    return {
      success: false,
      error: 'Authentication timed out. Please try again.',
    };
  }

  /**
   * Utility function to sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}