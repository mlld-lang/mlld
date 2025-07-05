import { ImmutableCache } from '@security/cache';
import * as readline from 'readline/promises';

export interface Advisory {
  id: string;
  created: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affects: string[];        // Registry module names
  gists: string[];         // Gist IDs that are affected
  type: 'data-exposure' | 'command-injection' | 'llm-injection' | 'privilege-escalation' | 'other';
  description: string;
  recommendation: string;
}

export interface AdvisoryDatabase {
  version: string;
  updated: string;
  advisories: Advisory[];
}

/**
 * Checks security advisories for registry modules and gists
 */
export class AdvisoryChecker {
  private static readonly ADVISORIES_URL = 
    'https://raw.githubusercontent.com/mlld-lang/registry/main/advisories.json';
  private static readonly CACHE_KEY = 'advisories:main';
  private static readonly CACHE_TTL = 3600000; // 1 hour
  
  constructor(private cache: ImmutableCache) {}
  
  /**
   * Check if a module or gist has advisories
   */
  async checkForAdvisories(
    moduleName: string | null, 
    gistId: string | null
  ): Promise<Advisory[]> {
    const advisories = await this.fetchAdvisories();
    
    return advisories.filter(advisory => {
      // Check if module is affected
      if (moduleName && advisory.affects.includes(moduleName)) {
        return true;
      }
      
      // Check if gist is affected
      if (gistId && advisory.gists.some(g => g.includes(gistId))) {
        return true;
      }
      
      return false;
    });
  }
  
  /**
   * Prompt user about advisories and get approval
   */
  async promptUserAboutAdvisories(
    advisories: Advisory[],
    importPath: string
  ): Promise<boolean> {
    if (advisories.length === 0) {
      return true; // No advisories, auto-approve
    }
    
    console.log('\n⚠️  Security Advisories Found:');
    console.log(`   Import: ${importPath}\n`);
    
    for (const advisory of advisories) {
      console.log(`   ${this.formatSeverity(advisory.severity)}: ${advisory.id}`);
      console.log(`   Type: ${advisory.type}`);
      console.log(`   Description: ${advisory.description}`);
      console.log(`   Recommendation: ${advisory.recommendation}\n`);
    }
    
    // If any critical advisories, show stronger warning
    const hasCritical = advisories.some(a => a.severity === 'critical');
    if (hasCritical) {
      console.log('   ⚠️  CRITICAL security issues detected!');
      console.log('   Importing this module is strongly discouraged.\n');
    }
    
    const rl = readline.createInterface({
      input: process.stdin as NodeJS.ReadStream,
      output: process.stdout as NodeJS.WriteStream
    });
    
    try {
      const question = hasCritical 
        ? '   Import module with CRITICAL security issues? [y/N]: '
        : '   Import module with security advisories? [y/N]: ';
        
      const answer = await rl.question(question);
      return answer.toLowerCase() === 'y';
    } finally {
      rl.close();
    }
  }
  
  /**
   * Format severity with color/emoji
   */
  private formatSeverity(severity: string): string {
    const icons: Record<string, string> = {
      critical: '🔴 CRITICAL',
      high: '🟡 HIGH',
      medium: '🟠 MEDIUM', 
      low: '🟢 LOW'
    };
    return icons[severity] || severity.toUpperCase();
  }
  
  /**
   * Fetch advisories with caching
   */
  private async fetchAdvisories(): Promise<Advisory[]> {
    // Check cache first using URL as key
    try {
      const cached = await this.cache.get(AdvisoryChecker.ADVISORIES_URL);
      if (cached) {
        const data = JSON.parse(cached) as AdvisoryDatabase;
        return data.advisories;
      }
    } catch (error) {
      // Cache miss or error, continue to fetch
    }
    
    // Fetch from GitHub
    try {
      const response = await fetch(AdvisoryChecker.ADVISORIES_URL);
      if (!response.ok) {
        // If advisories can't be fetched, log but don't block
        console.warn('⚠️  Could not fetch security advisories');
        return [];
      }
      
      const text = await response.text();
      const data = JSON.parse(text) as AdvisoryDatabase;
      
      // Cache for next time using URL as key
      await this.cache.set(AdvisoryChecker.ADVISORIES_URL, text);
      
      return data.advisories || [];
    } catch (error) {
      // If advisory check fails, log but don't block imports
      console.warn('⚠️  Could not check security advisories:', error.message);
      return [];
    }
  }
  
  /**
   * Get all advisories for audit purposes
   */
  async getAllAdvisories(): Promise<Advisory[]> {
    return this.fetchAdvisories();
  }
}