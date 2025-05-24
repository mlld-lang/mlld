import { createHash } from 'crypto';
import * as readline from 'readline/promises';
import type { ImportAllowEntry, ImportSecurityConfig } from '@core/config/types';
import { ConfigLoader } from '@core/config/loader';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ImportApproval {
  private config: ImportSecurityConfig;
  private configLoader: ConfigLoader;
  private projectPath: string;
  
  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.configLoader = new ConfigLoader(projectPath);
    const config = this.configLoader.load();
    this.config = config.security?.imports || {
      requireApproval: true,
      pinByDefault: true,
      allowed: []
    };
  }

  /**
   * Check if an import is approved, prompting user if needed
   */
  async checkApproval(url: string, content: string): Promise<boolean> {
    // If approval not required, allow all
    if (!this.config.requireApproval) {
      return true;
    }

    // Calculate content hash
    const hash = this.calculateHash(content);
    
    // Check if already approved
    const existingApproval = this.config.allowed?.find(entry => entry.url === url);
    
    if (existingApproval) {
      // If pinned to version, check hash
      if (existingApproval.pinnedVersion) {
        if (existingApproval.hash === hash) {
          return true;
        } else {
          // Content changed, need re-approval
          return this.promptForUpdate(url, content, existingApproval, hash);
        }
      } else {
        // Not pinned, allow any version
        return true;
      }
    }
    
    // New import, need approval
    return this.promptForApproval(url, content, hash);
  }

  private calculateHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private async promptForApproval(url: string, content: string, hash: string): Promise<boolean> {
    console.log(`\n⚠️  Import requires approval:`);
    console.log(`   ${url}\n`);
    
    // Show preview
    const preview = this.getContentPreview(content);
    console.log('   [Preview of first 20 lines]');
    console.log(preview);
    
    // Detect commands
    const commands = this.detectCommands(content);
    if (commands.length > 0) {
      console.log(`\n   This import contains ${commands.length} run command(s):`);
      commands.slice(0, 5).forEach(cmd => console.log(`   - ${cmd}`));
      if (commands.length > 5) {
        console.log(`   ... and ${commands.length - 5} more`);
      }
    }
    
    // Prompt user
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    try {
      console.log('\n   Allow this import?');
      console.log('   [y] This version only (recommended)');
      console.log('   [f] This + future updates');
      console.log('   [n] Never (cancel)');
      console.log('   [v] View full content\n');
      
      let choice = await rl.question('   Choice: ');
      
      // Handle view full content
      if (choice.toLowerCase() === 'v') {
        console.log('\n=== Full Content ===');
        console.log(content);
        console.log('=== End Content ===\n');
        choice = await rl.question('   Choice: ');
      }
      
      switch (choice.toLowerCase()) {
        case 'y':
          await this.saveApproval(url, hash, true, commands);
          console.log('   ✅ Import approved and cached\n');
          return true;
          
        case 'f':
          await this.saveApproval(url, hash, false, commands);
          console.log('   ✅ Import approved for this and future versions\n');
          return true;
          
        case 'n':
        default:
          console.log('   ❌ Import cancelled\n');
          return false;
      }
    } finally {
      rl.close();
    }
  }

  private async promptForUpdate(
    url: string, 
    content: string, 
    existing: ImportAllowEntry, 
    newHash: string
  ): Promise<boolean> {
    console.log(`\n⚠️  Cached import has changed:`);
    console.log(`   ${url}\n`);
    console.log(`   Previously approved: ${new Date(existing.allowedAt).toLocaleDateString()}`);
    console.log(`   Content has been modified since approval.\n`);
    
    // Show preview of new content
    const preview = this.getContentPreview(content);
    console.log('   [Preview of new content]');
    console.log(preview);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    try {
      console.log('\n   Accept updated content?');
      console.log('   [y] Yes, update to new version');
      console.log('   [n] No, cancel import\n');
      
      const choice = await rl.question('   Choice: ');
      
      if (choice.toLowerCase() === 'y') {
        await this.updateApproval(url, newHash, existing.pinnedVersion);
        console.log('   ✅ Import updated and cached\n');
        return true;
      } else {
        console.log('   ❌ Import cancelled\n');
        return false;
      }
    } finally {
      rl.close();
    }
  }

  private getContentPreview(content: string, lines: number = 20): string {
    const contentLines = content.split('\n');
    const preview = contentLines.slice(0, lines).join('\n');
    
    if (contentLines.length > lines) {
      return preview + '\n   ...';
    }
    
    return preview;
  }

  private detectCommands(content: string): string[] {
    const commands: string[] = [];
    
    // Regex to find @run and @exec directives in all formats:
    // - Plain: @run npm install
    // - Bracketed: @run [npm install]
    // - Backtick: @run `npm install`
    const runRegex = /@(?:run|exec)\s+(?:\[([^\]]+)\]|`([^`]+)`|([^\n\[`]+))/g;
    
    let match;
    while ((match = runRegex.exec(content)) !== null) {
      const command = match[1] || match[2] || match[3];
      if (command) {
        // Extract just the base command (first word)
        const baseCommand = command.trim().split(/\s+/)[0];
        if (baseCommand && !commands.includes(baseCommand)) {
          commands.push(baseCommand);
        }
      }
    }
    
    return commands;
  }

  private async saveApproval(
    url: string, 
    hash: string, 
    pinnedVersion: boolean,
    detectedCommands: string[]
  ): Promise<void> {
    const entry: ImportAllowEntry = {
      url,
      hash,
      pinnedVersion,
      allowedAt: new Date().toISOString(),
      detectedCommands
    };
    
    // Load current config
    const config = this.configLoader.load();
    
    // Ensure structure exists
    if (!config.security) config.security = {};
    if (!config.security.imports) config.security.imports = {};
    if (!config.security.imports.allowed) config.security.imports.allowed = [];
    
    // Add or update entry
    const existingIndex = config.security.imports.allowed.findIndex(e => e.url === url);
    if (existingIndex >= 0) {
      config.security.imports.allowed[existingIndex] = entry;
    } else {
      config.security.imports.allowed.push(entry);
    }
    
    // Save config
    const configPath = path.join(this.projectPath, 'meld.config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    // Reload config
    this.config = config.security.imports;
  }

  private async updateApproval(
    url: string,
    newHash: string,
    pinnedVersion: boolean
  ): Promise<void> {
    const config = this.configLoader.load();
    
    if (config.security?.imports?.allowed) {
      const entry = config.security.imports.allowed.find(e => e.url === url);
      if (entry) {
        entry.hash = newHash;
        entry.allowedAt = new Date().toISOString();
        
        // Save config
        const configPath = path.join(this.projectPath, 'meld.config.json');
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      }
    }
  }

  /**
   * Check if running in CI/non-interactive mode
   */
  isInteractive(): boolean {
    return process.stdin.isTTY && process.stdout.isTTY;
  }
}