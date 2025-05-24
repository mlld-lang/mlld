import * as vscode from 'vscode';
import * as path from 'path';
import { DocumentAnalyzer } from '../utils/document-analyzer';
import { HeaderExtractor } from '../utils/header-extractor';

export class MeldCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private analyzer: DocumentAnalyzer) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
    const line = document.lineAt(position).text;
    const linePrefix = line.substring(0, position.character);

    // Check different completion contexts
    if (this.isPathContext(linePrefix)) {
      return this.providePathCompletions(document, position);
    }

    if (this.isSectionShorthandContext(linePrefix)) {
      return this.provideSectionShorthandCompletions(document, position, linePrefix);
    }

    if (this.isVariableContext(linePrefix)) {
      return this.provideVariableCompletions(document, position);
    }

    if (this.isTemplateInterpolationContext(linePrefix)) {
      return this.provideTemplateVariableCompletions(document, position);
    }

    if (this.isSectionContext(linePrefix)) {
      return this.provideSectionCompletions(document, position);
    }

    if (this.isDirectiveContext(linePrefix)) {
      return this.provideDirectiveCompletions();
    }

    return [];
  }

  /**
   * Check if we're in a path context (after '[')
   */
  private isPathContext(linePrefix: string): boolean {
    // Check if we're inside square brackets
    const openBrackets = (linePrefix.match(/\[/g) || []).length;
    const closeBrackets = (linePrefix.match(/\]/g) || []).length;
    return openBrackets > closeBrackets;
  }

  /**
   * Check if we're in a variable context (after '@')
   */
  private isVariableContext(linePrefix: string): boolean {
    return /@\w*$/.test(linePrefix);
  }

  /**
   * Check if we're in template interpolation context (after '{{')
   */
  private isTemplateInterpolationContext(linePrefix: string): boolean {
    // Check if we're inside {{ }}
    const lastDoubleBrace = linePrefix.lastIndexOf('{{');
    const lastCloseDoubleBrace = linePrefix.lastIndexOf('}}');
    return lastDoubleBrace > lastCloseDoubleBrace;
  }

  /**
   * Check if we're in a section context (after '@add "')
   */
  private isSectionContext(linePrefix: string): boolean {
    return /@add\s+"[^"]*$/.test(linePrefix);
  }

  /**
   * Check if we're in section shorthand context (after '[file.md #')
   */
  private isSectionShorthandContext(linePrefix: string): boolean {
    // Match [...# with possible space after #
    const match = linePrefix.match(/\[[^\]]*#\s*$/);
    return match !== null;
  }

  /**
   * Check if we're at the start of a directive
   */
  private isDirectiveContext(linePrefix: string): boolean {
    return /^\s*@\w*$/.test(linePrefix);
  }

  /**
   * Provide path completions
   */
  private async providePathCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const items: vscode.CompletionItem[] = [];
    
    // Add special path variables
    const projectPath = new vscode.CompletionItem('@PROJECTPATH', vscode.CompletionItemKind.Variable);
    projectPath.detail = 'Project root directory';
    projectPath.documentation = 'Resolves to the root directory of your workspace';
    items.push(projectPath);

    const cwd = new vscode.CompletionItem('@CWD', vscode.CompletionItemKind.Variable);
    cwd.detail = 'Current working directory';
    cwd.documentation = 'Resolves to the current working directory';
    items.push(cwd);

    // Add markdown/meld files from workspace
    const files = await vscode.workspace.findFiles('**/*.{md,mld}', '**/node_modules/**', 50);
    const currentDir = path.dirname(document.uri.fsPath);

    for (const file of files) {
      // Skip the current file
      if (file.fsPath === document.uri.fsPath) continue;

      // Create relative path
      const relativePath = path.relative(currentDir, file.fsPath);
      const item = new vscode.CompletionItem(relativePath, vscode.CompletionItemKind.File);
      
      // Add details
      const fileName = path.basename(file.fsPath);
      item.detail = fileName;
      item.documentation = `Include content from ${fileName}`;
      
      // Adjust sort text to prioritize files in same directory
      if (relativePath.startsWith('..')) {
        item.sortText = 'b' + relativePath;
      } else {
        item.sortText = 'a' + relativePath;
      }
      
      items.push(item);
    }

    return items;
  }

  /**
   * Provide variable completions
   */
  private async provideVariableCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const variables = await this.analyzer.getAvailableVariables(document, position);
    
    return variables.map(variable => {
      const item = new vscode.CompletionItem(
        variable.name,
        vscode.CompletionItemKind.Variable
      );
      
      item.detail = `${variable.kind} variable`;
      item.documentation = new vscode.MarkdownString();
      item.documentation.appendMarkdown(`**Type:** ${variable.kind}\n\n`);
      item.documentation.appendMarkdown(`Defined at line ${variable.location.line}`);
      
      // Include @ in the insert text
      item.insertText = variable.name;
      
      return item;
    });
  }

  /**
   * Provide template variable completions (for {{ context)
   */
  private async provideTemplateVariableCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const variables = await this.analyzer.getAvailableVariables(document, position);
    
    return variables.map(variable => {
      const item = new vscode.CompletionItem(
        variable.name,
        vscode.CompletionItemKind.Variable
      );
      
      item.detail = `${variable.kind} variable`;
      item.documentation = `Insert {{${variable.name}}} interpolation`;
      
      // Complete the full interpolation
      item.insertText = `${variable.name}}}`;
      
      return item;
    });
  }

  /**
   * Provide section completions
   */
  private async provideSectionCompletions(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const items: vscode.CompletionItem[] = [];
    const headerMap = await HeaderExtractor.extractAllHeaders();
    
    for (const [filePath, headers] of headerMap) {
      const fileName = path.basename(filePath);
      
      for (const header of headers) {
        const item = new vscode.CompletionItem(
          header.text,
          vscode.CompletionItemKind.Reference
        );
        
        item.detail = HeaderExtractor.formatHeaderForCompletion(header, fileName);
        item.documentation = `Add section "${header.text}" from ${fileName}`;
        
        // Complete the full directive
        const currentDir = path.dirname(document.uri.fsPath);
        const relativePath = path.relative(currentDir, filePath);
        item.insertText = `${header.text}" from [${relativePath}]`;
        
        // Replace the partial string
        const line = document.lineAt(position).text;
        const match = line.match(/@add\s+"/);
        if (match) {
          const startPos = new vscode.Position(position.line, match.index! + match[0].length);
          item.range = new vscode.Range(startPos, position);
        }
        
        items.push(item);
      }
    }
    
    return items;
  }

  /**
   * Provide section completions for shorthand syntax [file.md #
   */
  private async provideSectionShorthandCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    linePrefix: string
  ): Promise<vscode.CompletionItem[]> {
    const items: vscode.CompletionItem[] = [];
    
    // Extract the file path from [file.md #
    const match = linePrefix.match(/\[([^\]#]+)#\s*$/);
    if (!match) return items;
    
    const filePath = match[1].trim();
    const currentDir = path.dirname(document.uri.fsPath);
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(currentDir, filePath);
    
    try {
      // Extract headers from the specific file
      const headers = await HeaderExtractor.extractHeadersFromFile(absolutePath);
      
      for (const header of headers) {
        const item = new vscode.CompletionItem(
          header.text,
          vscode.CompletionItemKind.Reference
        );
        
        item.detail = `${'#'.repeat(header.level)} ${header.text}`;
        item.documentation = `Insert section "${header.text}"`;
        
        // Just insert the section name, the user already typed the path
        item.insertText = ` ${header.text}]`;
        
        // Set range to replace from after the #
        const hashPos = linePrefix.lastIndexOf('#');
        if (hashPos >= 0) {
          const startPos = new vscode.Position(position.line, hashPos + 1);
          item.range = new vscode.Range(startPos, position);
        }
        
        items.push(item);
      }
    } catch (error) {
      console.error(`Failed to extract headers from ${filePath}:`, error);
    }
    
    return items;
  }

  /**
   * Provide directive completions
   */
  private provideDirectiveCompletions(): vscode.CompletionItem[] {
    const directives = [
      { name: 'text', desc: 'Define a text variable', snippet: 'text ${1:name} = "$2"' },
      { name: 'data', desc: 'Define a data structure', snippet: 'data ${1:name} = {\n  "$2": "$3"\n}' },
      { name: 'path', desc: 'Define a path variable', snippet: 'path ${1:name} = $2' },
      { name: 'run', desc: 'Run a command', snippet: 'run ${1:name} = ```${2:bash}\n$3\n```' },
      { name: 'exec', desc: 'Execute code with return value', snippet: 'exec ${1:name} = ```${2:javascript}\n$3\n```' },
      { name: 'add', desc: 'Add content or template', snippet: 'add [$1]' },
      { name: 'import', desc: 'Import variables', snippet: 'import * from [$1]' }
    ];
    
    return directives.map(dir => {
      const item = new vscode.CompletionItem(dir.name, vscode.CompletionItemKind.Keyword);
      item.detail = `@${dir.name} directive`;
      item.documentation = dir.desc;
      item.insertText = new vscode.SnippetString(dir.snippet);
      return item;
    });
  }
}