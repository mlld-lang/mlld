import { createHash } from 'crypto';
import * as readline from 'readline/promises';
import { existsSync, readFileSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ImportAllowEntry {
  url: string;
  hash: string;
  pinnedVersion: boolean;
  allowedAt: string;
  detectedCommands?: string[];
}

interface ImportSecurityConfig {
  requireApproval: boolean;
  allowed: ImportAllowEntry[];
  pinByDefault: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ImportApproval {
  private config: ImportSecurityConfig;
  private projectPath: string;
  private configPath: string;
  
  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.configPath = path.join(this.projectPath, 'mlld-config.json');
    this.config = this.loadImportSecurityConfig();
  }

  private defaultImportSecurityConfig(): ImportSecurityConfig {
    return {
      requireApproval: true,
      pinByDefault: true,
      allowed: []
    };
  }

  private loadImportSecurityConfig(): ImportSecurityConfig {
    if (!existsSync(this.configPath)) {
      return this.defaultImportSecurityConfig();
    }

    try {
      const content = readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(content) as unknown;
      if (!isObject(parsed)) {
        return this.defaultImportSecurityConfig();
      }

      const security = isObject(parsed.security) ? parsed.security : undefined;
      const imports = isObject(security?.imports) ? security.imports : undefined;
      const allowed = Array.isArray(imports?.allowed)
        ? (imports.allowed.filter(isObject).map(entry => ({
            url: typeof entry.url === 'string' ? entry.url : '',
            hash: typeof entry.hash === 'string' ? entry.hash : '',
            pinnedVersion: Boolean(entry.pinnedVersion),
            allowedAt: typeof entry.allowedAt === 'string' ? entry.allowedAt : new Date().toISOString(),
            detectedCommands: Array.isArray(entry.detectedCommands)
              ? entry.detectedCommands.filter((value): value is string => typeof value === 'string')
              : undefined
          })).filter(entry => entry.url && entry.hash))
        : [];

      return {
        requireApproval: imports?.requireApproval !== false,
        pinByDefault: imports?.pinByDefault !== false,
        allowed
      };
    } catch {
      return this.defaultImportSecurityConfig();
    }
  }

  private async readProjectConfig(): Promise<Record<string, unknown>> {
    if (!existsSync(this.configPath)) {
      return {};
    }

    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(content) as unknown;
      return isObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * Check if an import is approved, prompting user if needed
   */
  async checkApproval(url: string, content: string): Promise<boolean> {
    // If approval not required, allow all
    if (!this.config.requireApproval) {
      return true;
    }
    
    // In CI/test environments, auto-approve
    if (process.env.CI || 
        process.env.NODE_ENV === 'test' || 
        process.env.MLLD_TEST === '1' ||
        process.env.VITEST || 
        process.env.VITEST_WORKER_ID ||
        process.env.VITEST_POOL_ID !== undefined ||
        !process.stdin.isTTY ||
        !process.stdout.isTTY) {
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
    // In test mode, auto-approve without saving
    if (process.env.MLLD_TEST === '1') {
      return true;
    }
    
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
    // In test mode, auto-approve without saving
    if (process.env.MLLD_TEST === '1') {
      return true;
    }
    
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
        await this.updateApproval(url, newHash);
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
    
    const config = await this.readProjectConfig();
    const security = isObject(config.security) ? config.security : {};
    const imports = isObject(security.imports) ? security.imports : {};
    const allowed = Array.isArray(imports.allowed)
      ? imports.allowed.filter(isObject).map(item => ({
          url: typeof item.url === 'string' ? item.url : '',
          hash: typeof item.hash === 'string' ? item.hash : '',
          pinnedVersion: Boolean(item.pinnedVersion),
          allowedAt: typeof item.allowedAt === 'string' ? item.allowedAt : new Date().toISOString(),
          detectedCommands: Array.isArray(item.detectedCommands)
            ? item.detectedCommands.filter((value): value is string => typeof value === 'string')
            : undefined
        }))
      : [];

    const existingIndex = allowed.findIndex(e => e.url === url);
    if (existingIndex >= 0) {
      allowed[existingIndex] = entry;
    } else {
      allowed.push(entry);
    }

    const updatedImports = {
      requireApproval: imports.requireApproval !== false,
      pinByDefault: imports.pinByDefault !== false,
      allowed
    };

    config.security = {
      ...security,
      imports: updatedImports
    };

    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));

    this.config = updatedImports;
  }

  private async updateApproval(
    url: string,
    newHash: string
  ): Promise<void> {
    const config = await this.readProjectConfig();
    const security = isObject(config.security) ? config.security : {};
    const imports = isObject(security.imports) ? security.imports : {};
    const allowed = Array.isArray(imports.allowed) ? imports.allowed : [];

    const entry = allowed.find(candidate => isObject(candidate) && candidate.url === url) as Record<string, unknown> | undefined;
    if (!entry) {
      return;
    }

    entry.hash = newHash;
    entry.allowedAt = new Date().toISOString();

    config.security = {
      ...security,
      imports: {
        requireApproval: imports.requireApproval !== false,
        pinByDefault: imports.pinByDefault !== false,
        allowed
      }
    };

    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    this.config = this.loadImportSecurityConfig();
  }

  /**
   * Check if running in CI/non-interactive mode
   */
  isInteractive(): boolean {
    return process.stdin.isTTY && process.stdout.isTTY;
  }
}
