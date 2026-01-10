import { formatModuleReference } from '../utils/output';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import chalk from 'chalk';

const REGISTRY_URL = 'https://raw.githubusercontent.com/mlld-lang/registry/main/modules.json';

export interface InfoOptions {
  verbose?: boolean;
  basePath?: string;
  format?: 'text' | 'json';
}

export interface ModuleInfo {
  name: string;
  author: string;
  description?: string;
  version?: string;
  needs?: string[];
  keywords?: string[];
  license?: string;
  repository?: string;
  sourceUrl?: string;
  publishedAt?: string;
}

interface RegistryModule {
  name: string;
  author: string;
  about: string;
  version?: string;
  needs: string[];
  keywords?: string[];
  license: string;
  repo?: string;
  source: {
    url: string;
    contentHash: string;
  };
  publishedAt?: string;
}

let registryCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 300000; // 5 minutes

async function fetchRegistry(): Promise<Record<string, RegistryModule>> {
  if (registryCache && Date.now() - registryCache.timestamp < CACHE_TTL) {
    return registryCache.data.modules;
  }

  const response = await fetch(REGISTRY_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch registry: ${response.status}`);
  }

  const data = await response.json();
  registryCache = { data, timestamp: Date.now() };
  return data.modules;
}

export async function getModuleInfo(moduleRef: string): Promise<ModuleInfo & { sourceUrl: string }> {
  const { username, moduleName } = formatModuleReference(moduleRef);
  const moduleKey = `@${username}/${moduleName}`;

  const modules = await fetchRegistry();
  const entry = modules[moduleKey];

  if (!entry) {
    throw new Error(`Module not found: ${moduleKey}`);
  }

  return {
    name: entry.name,
    author: entry.author,
    description: entry.about,
    version: entry.version,
    needs: entry.needs,
    keywords: entry.keywords,
    license: entry.license,
    repository: entry.repo,
    sourceUrl: entry.source.url,
    publishedAt: entry.publishedAt
  };
}

// Simple mlld syntax highlighter for terminal
function highlightMlld(code: string): string {
  let result = code;

  // Directives at start of line (with or without leading slash)
  result = result.replace(/^(\/?(?:var|show|stream|run|exe|path|import|when|output|append|for|log|guard|export|policy))\b/gm,
    chalk.magenta('$1'));

  // Keywords
  result = result.replace(/\b(from|as|foreach|with|to)\b/g, chalk.magenta('$1'));

  // Reserved variables
  result = result.replace(/@(INPUT|TIME|PROJECTPATH|STDIN|NOW|base)\b/g, chalk.cyan('@$1'));

  // Regular variables (after reserved to not double-match)
  result = result.replace(/@(\w+)/g, (match, name) => {
    // Skip if already colored (reserved vars)
    if (['INPUT', 'TIME', 'PROJECTPATH', 'STDIN', 'NOW', 'base'].includes(name)) {
      return match;
    }
    return chalk.blue(`@${name}`);
  });

  // Strings in backticks
  result = result.replace(/`([^`]*)`/g, chalk.green('`$1`'));

  // Double-quoted strings
  result = result.replace(/"([^"]*)"/g, chalk.green('"$1"'));

  // Comments
  result = result.replace(/(>>|<<)(.*)$/gm, chalk.gray('$1$2'));

  // Alligators
  result = result.replace(/<([^>]+)>/g, chalk.yellow('<$1>'));

  // Numbers
  result = result.replace(/\b(\d+(?:\.\d+)?)\b/g, chalk.yellow('$1'));

  // Braces for code blocks
  result = result.replace(/([{}])/g, chalk.gray('$1'));

  return result;
}

// Highlight markdown with mlld code blocks and topic tree
function highlightMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inMlldBlock = false;
  let inCodeBlock = false;
  let mlldContent: string[] = [];

  for (const line of lines) {
    // Check for mlld code block start
    if (line.match(/^```mlld/)) {
      inMlldBlock = true;
      result.push(chalk.gray(line));
      continue;
    }

    // Check for generic code block start
    if (line.match(/^```/) && !inMlldBlock && !inCodeBlock) {
      inCodeBlock = true;
      result.push(chalk.gray(line));
      continue;
    }

    // Check for code block end
    if ((inMlldBlock || inCodeBlock) && line.match(/^```$/)) {
      if (inMlldBlock) {
        // Highlight accumulated mlld content
        const highlighted = highlightMlld(mlldContent.join('\n'));
        result.push(highlighted);
        mlldContent = [];
      }
      result.push(chalk.gray(line));
      inMlldBlock = false;
      inCodeBlock = false;
      continue;
    }

    if (inMlldBlock) {
      mlldContent.push(line);
    } else if (inCodeBlock) {
      result.push(chalk.gray(line));
    } else {
      // Regular content
      let processed = line;

      // Title line (e.g., "MLLD HELP TOPICS")
      if (line.match(/^[A-Z][A-Z\s]+$/)) {
        processed = chalk.bold(line);
      }
      // Category headers (e.g., "syntax/")
      else if (line.match(/^[a-z-]+\/$/)) {
        processed = chalk.cyan.bold(line);
      }
      // Topic entries (e.g., "  intro                    Description")
      else if (line.match(/^  [a-z][\w-]+/)) {
        // Handle entries with at least one space between ID and description
        const match = line.match(/^(  )([a-z][\w-]+)(\s*)(.*)$/);
        if (match) {
          const desc = match[4] || '';
          processed = match[1] + chalk.blue(match[2]) + match[3] + (desc ? chalk.gray(desc) : '');
        }
      }
      // Usage lines
      else if (line.match(/^Use:/)) {
        processed = chalk.dim(line);
      }
      // Headers
      else if (line.match(/^##+ /)) {
        processed = chalk.bold.cyan(line);
      }
      // Horizontal rule
      else if (line.match(/^---+$/)) {
        processed = chalk.dim(line);
      }
      // Bullet points with formatting
      else if (line.match(/^[-*] /)) {
        // Apply inline formatting to bullet points
        processed = line
          .replace(/\*\*([^*]+)\*\*/g, (_, text) => chalk.bold(text))
          .replace(/`([^`]+)`/g, (_, code) => chalk.yellow('`' + code + '`'));
      }
      // Bold text
      else if (line.match(/\*\*[^*]+\*\*/)) {
        processed = line.replace(/\*\*([^*]+)\*\*/g, (_, text) => chalk.bold(text));
        // Also handle inline code
        processed = processed.replace(/`([^`]+)`/g, (_, code) => chalk.yellow('`' + code + '`'));
      }
      // Inline code only
      else if (line.match(/`[^`]+`/)) {
        processed = line.replace(/`([^`]+)`/g, (_, code) => chalk.yellow('`' + code + '`'));
      }

      result.push(processed);
    }
  }

  // Handle unclosed code block
  if (mlldContent.length > 0) {
    result.push(highlightMlld(mlldContent.join('\n')));
  }

  return result.join('\n');
}

async function fetchSection(sourceUrl: string, section: string, basePath: string): Promise<string | null> {
  const fileSystem = new NodeFileSystem();
  const pathService = new PathService(basePath, fileSystem);

  const source = `var @content = <${sourceUrl} # ${section}>\nshow @content`;

  try {
    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath,
      approveAllImports: true,
      format: 'markdown',
      streaming: { enabled: false }
    });

    const output = typeof result === 'string' ? result : (result as any).output;
    return output?.trim() || null;
  } catch {
    return null;
  }
}

async function displayInfo(moduleRef: string, options: InfoOptions = {}): Promise<void> {
  const info = await getModuleInfo(moduleRef);

  if (options.format === 'json') {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  // Colorized text format
  console.log();
  console.log(`${chalk.cyan.bold(`@${info.author}/${info.name}`)} ${chalk.gray(`v${info.version || '?'}`)}`);
  console.log(info.description || 'No description');
  console.log();

  const label = (s: string) => chalk.dim(s.padEnd(10));

  if (info.needs?.length) console.log(`${label('needs')} ${info.needs.join(', ')}`);
  if (info.license) console.log(`${label('license')} ${info.license}`);
  if (info.repository) console.log(`${label('repo')} ${chalk.blue(info.repository)}`);
  if (info.keywords?.length) console.log(`${label('keywords')} ${chalk.dim(info.keywords.join(', '))}`);
  if (info.publishedAt) console.log(`${label('published')} ${new Date(info.publishedAt).toLocaleDateString()}`);

  // Fetch and display tldr
  const basePath = options.basePath || process.cwd();
  const tldr = await fetchSection(info.sourceUrl, 'tldr', basePath);
  if (tldr) {
    console.log();
    console.log(highlightMarkdown(tldr));
  }
}

export async function infoCommand(moduleRef: string, options: InfoOptions = {}): Promise<void> {
  if (!moduleRef) {
    console.error(chalk.red('Module reference is required'));
    console.log('Usage: mlld info @username/module');
    process.exit(1);
  }

  try {
    await displayInfo(moduleRef, options);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      console.error(chalk.red(`Module not found: ${moduleRef}`));
      console.log('\nSuggestions:');
      console.log(chalk.gray('  - Check the module name spelling'));
      console.log(chalk.gray('  - Ensure the format is: @username/module'));
    } else {
      console.error(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}

// CLI interface
export function createInfoCommand() {
  return {
    name: 'info',
    aliases: ['show'],
    description: 'Show detailed information about a module',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const moduleRef = args[0];

      if (!moduleRef) {
        console.error(chalk.red('Module reference is required'));
        console.log('Usage: mlld info @username/module');
        process.exit(1);
      }

      const options: InfoOptions = {
        verbose: flags.verbose || flags.v,
        basePath: flags['base-path'] || process.cwd(),
        format: flags.format || 'text'
      };

      if (options.format && !['text', 'json'].includes(options.format)) {
        console.error(chalk.red('Invalid format. Must be: text or json'));
        process.exit(1);
      }

      await infoCommand(moduleRef, options);
    }
  };
}

// Export highlighters for use by docs command
export { highlightMarkdown, highlightMlld };
