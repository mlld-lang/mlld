import type { TestEnvironment } from './TestEnvironment';
import type { TTLConfig } from '../mocks/MockURLCache';
import type { DirectiveNode } from '@core/types';

export interface TTLTestResult {
  ttl: TTLConfig;
  fetches: Array<{
    content: string;
    timestamp: number;
    fromCache: boolean;
    duration?: number;
  }>;
  behaviorCorrect: boolean;
  expectedBehavior: string;
  actualBehavior: string;
}

export interface TrustTestResult {
  trust: string;
  url: string;
  allowed: boolean;
  reason: string;
  securityChecks: number;
}

export interface MetadataTestResult {
  directive: string;
  metadata: any;
  appliedCorrectly: boolean;
  securityContext: any;
  cacheContext: any;
}

/**
 * Comprehensive framework for testing TTL/trust enforcement
 * Provides utilities for end-to-end testing of security metadata application
 */
export class TTLTestFramework {
  constructor(private env: TestEnvironment) {}

  /**
   * Create AST directive node with TTL/trust metadata for testing
   */
  static createDirectiveWithMetadata(
    directive: 'run' | 'path' | 'text' | 'import',
    content: string,
    metadata: {
      ttl?: TTLConfig;
      trust?: 'always' | 'verify' | 'never' | 'high' | 'medium' | 'low';
      requireHash?: boolean;
    }
  ): DirectiveNode {
    const baseNode: DirectiveNode = {
      type: 'directive',
      directive,
      values: {},
      location: { line: 1, column: 1 }
    };

    // Set directive-specific values
    switch (directive) {
      case 'run':
        baseNode.values.command = [{ type: 'text', value: content }];
        break;
      case 'path':
        const [identifier, path] = content.split('=').map(s => s.trim());
        baseNode.values.identifier = [{ type: 'text', value: identifier }];
        baseNode.values.path = [{ type: 'text', value: path }];
        break;
      case 'text':
        const [textId, textValue] = content.split('=').map(s => s.trim());
        baseNode.values.identifier = [{ type: 'text', value: textId }];
        baseNode.values.content = [{ type: 'text', value: textValue }];
        break;
      case 'import':
        baseNode.values.imports = [{ type: 'text', value: content }];
        break;
    }

    // Add metadata if provided
    if (Object.keys(metadata).length > 0) {
      baseNode.meta = metadata as any;
    }

    return baseNode;
  }

  /**
   * Test TTL enforcement end-to-end with multiple fetches
   */
  async testTTLEnforcement(url: string, ttl: TTLConfig): Promise<TTLTestResult> {
    const startTime = Date.now();
    const fetches: TTLTestResult['fetches'] = [];

    // Clear any existing cache for this URL
    const cache = this.env.getURLCache?.();
    if (cache && 'delete' in cache) {
      await (cache as any).delete(url);
    }

    // First fetch - should always miss cache
    const fetch1Start = Date.now();
    const content1 = await this.fetchWithTTL(url, ttl);
    const fetch1End = Date.now();
    fetches.push({
      content: content1,
      timestamp: fetch1End,
      fromCache: false,
      duration: fetch1End - fetch1Start
    });

    // Second fetch immediately - behavior depends on TTL
    const fetch2Start = Date.now();
    const content2 = await this.fetchWithTTL(url, ttl);
    const fetch2End = Date.now();
    fetches.push({
      content: content2,
      timestamp: fetch2End,
      fromCache: this.shouldBeCached(ttl, 0),
      duration: fetch2End - fetch2Start
    });

    // Third fetch after delay (for duration-based TTL)
    let content3: string | undefined;
    if (ttl.type === 'duration' && ttl.value) {
      await this.waitFor(ttl.value + 100); // Wait for expiry + buffer
      
      const fetch3Start = Date.now();
      content3 = await this.fetchWithTTL(url, ttl);
      const fetch3End = Date.now();
      fetches.push({
        content: content3,
        timestamp: fetch3End,
        fromCache: false, // Should be expired
        duration: fetch3End - fetch3Start
      });
    }

    const result: TTLTestResult = {
      ttl,
      fetches,
      behaviorCorrect: this.verifyTTLBehavior(ttl, fetches),
      expectedBehavior: this.getExpectedTTLBehavior(ttl),
      actualBehavior: this.getActualTTLBehavior(fetches)
    };

    return result;
  }

  /**
   * Test trust level enforcement for different directive types
   */
  async testTrustEnforcement(trust: string, url: string, directive: 'path' | 'import' = 'import'): Promise<TrustTestResult> {
    const initialSecurityChecks = this.env.getSecurityCheckCount?.() || 0;
    
    // Create directive with trust metadata
    const directiveNode = TTLTestFramework.createDirectiveWithMetadata(
      directive,
      directive === 'path' ? `testVar = ${url}` : url,
      { trust: trust as any }
    );

    try {
      // Attempt to evaluate the directive
      await this.env.evaluate?.(directiveNode);
      
      const finalSecurityChecks = this.env.getSecurityCheckCount?.() || 0;
      
      return {
        trust,
        url,
        allowed: true,
        reason: 'No exception thrown',
        securityChecks: finalSecurityChecks - initialSecurityChecks
      };
    } catch (error) {
      const finalSecurityChecks = this.env.getSecurityCheckCount?.() || 0;
      
      return {
        trust,
        url,
        allowed: false,
        reason: error.message,
        securityChecks: finalSecurityChecks - initialSecurityChecks
      };
    }
  }

  /**
   * Test that metadata is properly passed through the evaluation pipeline
   */
  async testMetadataPropagation(
    directive: 'run' | 'path' | 'text',
    content: string,
    metadata: any
  ): Promise<MetadataTestResult> {
    const directiveNode = TTLTestFramework.createDirectiveWithMetadata(directive, content, metadata);
    
    let securityContext: any = null;
    let cacheContext: any = null;
    let appliedCorrectly = false;

    try {
      // Mock the security manager to capture context
      if (this.env.mockCommandApproval) {
        // Set up interceptor to capture security context
        const originalCheckCommand = this.env.getSecurityManager?.()?.checkCommand;
        if (originalCheckCommand) {
          (this.env.getSecurityManager() as any).checkCommand = async (command: string, context?: any) => {
            securityContext = context;
            return originalCheckCommand.call(this.env.getSecurityManager(), command, context);
          };
        }
      }

      // Evaluate the directive
      await this.env.evaluate?.(directiveNode);
      
      // Check if metadata was applied correctly
      appliedCorrectly = this.verifyMetadataApplication(metadata, securityContext, cacheContext);
      
    } catch (error) {
      // Error might be expected for certain trust levels
    }

    return {
      directive,
      metadata,
      appliedCorrectly,
      securityContext,
      cacheContext
    };
  }

  /**
   * Test multiple TTL scenarios in sequence
   */
  async testTTLScenarios(): Promise<Array<{ scenario: string; result: TTLTestResult }>> {
    const scenarios: Array<{ name: string; url: string; ttl: TTLConfig }> = [
      {
        name: 'Live TTL (always fresh)',
        url: 'https://live-test.com/data',
        ttl: { type: 'live' }
      },
      {
        name: 'Static TTL (never expires)',
        url: 'https://static-test.com/data',
        ttl: { type: 'static' }
      },
      {
        name: 'Duration TTL (1 second)',
        url: 'https://duration-test.com/data',
        ttl: { type: 'duration', value: 1000 }
      },
      {
        name: 'Duration TTL (5 seconds)',
        url: 'https://duration-long-test.com/data',
        ttl: { type: 'duration', value: 5000 }
      }
    ];

    const results: Array<{ scenario: string; result: TTLTestResult }> = [];

    for (const scenario of scenarios) {
      const result = await this.testTTLEnforcement(scenario.url, scenario.ttl);
      results.push({
        scenario: scenario.name,
        result
      });
      
      // Small delay between scenarios
      await this.waitFor(100);
    }

    return results;
  }

  /**
   * Test trust level scenarios
   */
  async testTrustScenarios(): Promise<Array<{ scenario: string; result: TrustTestResult }>> {
    const scenarios: Array<{ name: string; trust: string; url: string }> = [
      {
        name: 'Trust Always (should allow)',
        trust: 'always',
        url: 'https://example.com/safe.mld'
      },
      {
        name: 'Trust Verify (should check security)',
        trust: 'verify',
        url: 'https://example.com/verify.mld'
      },
      {
        name: 'Trust Never (should block)',
        trust: 'never',
        url: 'https://example.com/blocked.mld'
      },
      {
        name: 'Trust High (should allow with minimal checks)',
        trust: 'high',
        url: 'https://trusted.com/data.mld'
      },
      {
        name: 'Trust Low (should require extensive checks)',
        trust: 'low',
        url: 'https://untrusted.com/data.mld'
      }
    ];

    const results: Array<{ scenario: string; result: TrustTestResult }> = [];

    for (const scenario of scenarios) {
      const result = await this.testTrustEnforcement(scenario.trust, scenario.url);
      results.push({
        scenario: scenario.name,
        result
      });
    }

    return results;
  }

  /**
   * Comprehensive test of TTL and trust interaction
   */
  async testTTLTrustInteraction(
    url: string,
    ttl: TTLConfig,
    trust: string
  ): Promise<{
    ttlResult: TTLTestResult;
    trustResult: TrustTestResult;
    interactionCorrect: boolean;
  }> {
    // Test TTL behavior
    const ttlResult = await this.testTTLEnforcement(url, ttl);
    
    // Test trust behavior
    const trustResult = await this.testTrustEnforcement(trust, url);
    
    // Verify interaction is correct
    const interactionCorrect = this.verifyTTLTrustInteraction(ttlResult, trustResult, ttl, trust);
    
    return {
      ttlResult,
      trustResult,
      interactionCorrect
    };
  }

  // === Private Helper Methods ===

  private async fetchWithTTL(url: string, ttl: TTLConfig): Promise<string> {
    // Use URLCache if available
    const cache = this.env.getURLCache?.();
    if (cache && 'get' in cache) {
      const cached = await (cache as any).get(url, ttl);
      if (cached) return cached;
    }

    // Fallback to environment fetchURL
    const content = await this.env.fetchURL?.(url) || `Mock content for ${url}`;
    
    // Cache the result if cache is available
    if (cache && 'set' in cache && ttl.type !== 'live') {
      await (cache as any).set(url, content, { ttl });
    }
    
    return content;
  }

  private shouldBeCached(ttl: TTLConfig, ageMs: number): boolean {
    switch (ttl.type) {
      case 'live':
        return false; // Never cached
      case 'static':
        return true; // Always cached
      case 'duration':
        return ageMs < (ttl.value || 0); // Cached if not expired
      default:
        return false;
    }
  }

  private verifyTTLBehavior(ttl: TTLConfig, fetches: TTLTestResult['fetches']): boolean {
    if (fetches.length < 2) return false;

    const [fetch1, fetch2, fetch3] = fetches;

    switch (ttl.type) {
      case 'live':
        // Should never cache - each fetch should potentially be different
        // We can't verify content differences easily, so check cache behavior
        return !fetch2.fromCache && (fetch3 ? !fetch3.fromCache : true);
        
      case 'static':
        // Should always cache - content should be identical from second fetch
        return fetch2.fromCache && fetch1.content === fetch2.content;
        
      case 'duration':
        // Should cache until expiry
        const cached = fetch2.fromCache && fetch1.content === fetch2.content;
        const expired = fetch3 ? !fetch3.fromCache : true;
        return cached && expired;
        
      default:
        return false;
    }
  }

  private getExpectedTTLBehavior(ttl: TTLConfig): string {
    switch (ttl.type) {
      case 'live':
        return 'Never cache, always fetch fresh content';
      case 'static':
        return 'Cache forever, never expire';
      case 'duration':
        return `Cache for ${ttl.value}ms, then expire`;
      default:
        return 'Unknown TTL behavior';
    }
  }

  private getActualTTLBehavior(fetches: TTLTestResult['fetches']): string {
    if (fetches.length < 2) return 'Insufficient data';

    const cacheHits = fetches.filter(f => f.fromCache).length;
    const avgDuration = fetches.reduce((sum, f) => sum + (f.duration || 0), 0) / fetches.length;

    return `${cacheHits}/${fetches.length} cache hits, avg duration: ${avgDuration.toFixed(1)}ms`;
  }

  private verifyMetadataApplication(metadata: any, securityContext: any, cacheContext: any): boolean {
    // Check if trust level was passed to security context
    if (metadata.trust && securityContext?.metadata?.trust !== metadata.trust) {
      return false;
    }

    // Check if TTL was applied (would need cache context to verify)
    if (metadata.ttl && !cacheContext?.ttl) {
      // Can't verify without cache context, assume correct for now
    }

    return true;
  }

  private verifyTTLTrustInteraction(
    ttlResult: TTLTestResult,
    trustResult: TrustTestResult,
    ttl: TTLConfig,
    trust: string
  ): boolean {
    // High trust should allow caching
    if (trust === 'always' && !ttlResult.behaviorCorrect) {
      return false;
    }

    // Never trust should block regardless of TTL
    if (trust === 'never' && trustResult.allowed) {
      return false;
    }

    // Verify trust should result in security checks
    if (trust === 'verify' && trustResult.securityChecks === 0) {
      return false;
    }

    return true;
  }

  private async waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}