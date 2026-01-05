import { getModuleInfo, highlightMarkdown } from './info';
import { interpret } from '@interpreter/index';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import chalk from 'chalk';

export interface DocsOptions {
  verbose?: boolean;
  basePath?: string;
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

export async function docsCommand(moduleRef: string, options: DocsOptions = {}): Promise<void> {
  if (!moduleRef) {
    console.error(chalk.red('Module reference is required'));
    console.log('Usage: mlld docs @username/module');
    process.exit(1);
  }

  const basePath = options.basePath || process.cwd();

  try {
    const info = await getModuleInfo(moduleRef);

    // Fetch tldr and docs sections
    const tldr = await fetchSection(info.sourceUrl, 'tldr', basePath);
    const docs = await fetchSection(info.sourceUrl, 'docs', basePath);

    if (!tldr && !docs) {
      console.log(chalk.yellow(`No documentation found for @${info.author}/${info.name}`));
      console.log(chalk.gray('Module should have # tldr and/or # docs sections'));
      return;
    }

    // Display tldr first, then docs - with syntax highlighting
    if (tldr) {
      console.log(highlightMarkdown(tldr));
    }

    if (docs) {
      if (tldr) console.log(); // Add spacing between sections
      console.log(highlightMarkdown(docs));
    }
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      console.error(chalk.red(`Module not found: ${moduleRef}`));
      console.log(chalk.gray('Check the module name and ensure it exists in the registry'));
    } else {
      if (options.verbose) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red(`Failed to fetch documentation for ${moduleRef}`));
      }
    }
    process.exit(1);
  }
}

// CLI interface
export function createDocsCommand() {
  return {
    name: 'docs',
    description: 'Show module documentation (tldr + docs sections)',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const moduleRef = args[0];

      if (!moduleRef) {
        console.error(chalk.red('Module reference is required'));
        console.log('Usage: mlld docs @username/module');
        process.exit(1);
      }

      const options: DocsOptions = {
        verbose: flags.verbose || flags.v,
        basePath: flags['base-path'] || process.cwd()
      };

      await docsCommand(moduleRef, options);
    }
  };
}
