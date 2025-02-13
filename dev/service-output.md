# OutputService

Below is a focused design for the OutputService that leverages the llmxml library for LLM-friendly XML transformations. This service provides a clean interface to convert final Meld AST/state into desired output formats while ensuring we reuse existing functionality rather than rebuilding it.

────────────────────────────────────────────────────────────────────────
I. HIGH-LEVEL ROLE OF THE OUTPUTSERVICE
────────────────────────────────────────────────────────────────────────

The OutputService is the last step in the Meld pipeline:

 1) ParserService → uses meld-ast to parse text → AST
 2) InterpreterService → processes nodes, updates state
 3) OutputService → converts final state to output format:
    • For Markdown: minimal transformation needed
    • For LLM XML: leverage llmxml library

We ensure all interpretation is done before output conversion starts. The OutputService's role is purely "final state → output string."

────────────────────────────────────────────────────────────────────────
II. DESIGN GOALS
────────────────────────────────────────────────────────────────────────

1. Leverage Existing Libraries  
   • Use llmxml for XML/LLM format conversion
   • Only implement custom conversion logic where absolutely necessary
   • Maintain compatibility with llmxml's expectations

2. Clean Integration  
   • Wrap llmxml in a service-oriented way
   • Handle any error translation to our types
   • Provide simple format selection ('md' or 'llm')

3. Minimal Custom Code  
   • Focus on integration rather than reimplementation
   • Only add format-specific logic not covered by llmxml
   • Keep the service lean and maintainable

────────────────────────────────────────────────────────────────────────
III. CODE STRUCTURE
────────────────────────────────────────────────────────────────────────

services/
 ├─ OutputService/
 │   ├─ OutputService.ts         # Main service implementation
 │   ├─ OutputService.test.ts    # Tests next to implementation
 │   ├─ IOutputService.ts        # Service interface
 │   ├─ formats/
 │   │   ├─ MarkdownOutput.ts    # Markdown format converter
 │   │   ├─ MarkdownOutput.test.ts
 │   │   ├─ LLMOutput.ts        # LLM XML format converter
 │   │   └─ LLMOutput.test.ts
 │   └─ errors/
 │       ├─ OutputError.ts       # Output-specific errors
 │       └─ OutputError.test.ts

Inside IOutputService.ts:

```typescript
import type { MeldNode } from 'meld-spec';
import type { IStateService } from '../StateService/IStateService';

export type OutputFormat = 'markdown' | 'llm';

export interface OutputOptions {
  /**
   * Whether to include state variables in the output
   * @default false
   */
  includeState?: boolean;

  /**
   * Whether to preserve original formatting (whitespace, newlines)
   * @default true
   */
  preserveFormatting?: boolean;

  /**
   * Custom format-specific options
   */
  formatOptions?: Record<string, unknown>;
}

export interface IOutputService {
  /**
   * Convert Meld nodes and state to the specified output format
   * @throws {MeldOutputError} If conversion fails
   */
  convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string>;

  /**
   * Register a custom format converter
   */
  registerFormat(
    format: string,
    converter: (nodes: MeldNode[], state: IStateService, options?: OutputOptions) => Promise<string>
  ): void;

  /**
   * Check if a format is supported
   */
  supportsFormat(format: string): boolean;

  /**
   * Get a list of all supported formats
   */
  getSupportedFormats(): string[];
}
```

Inside OutputService.ts:

```typescript
export class OutputService implements IOutputService {
  private formatters = new Map<string, (
    nodes: MeldNode[],
    state: IStateService,
    options?: OutputOptions
  ) => Promise<string>>();

  constructor() {
    // Register default formatters
    this.registerFormat('markdown', this.convertToMarkdown.bind(this));
    this.registerFormat('llm', this.convertToLLMXML.bind(this));

    logger.debug('OutputService initialized with default formatters', {
      formats: Array.from(this.formatters.keys())
    });
  }

  async convert(
    nodes: MeldNode[],
    state: IStateService,
    format: OutputFormat,
    options?: OutputOptions
  ): Promise<string> {
    const opts = { 
      includeState: false,
      preserveFormatting: true,
      formatOptions: {},
      ...options 
    };
    
    logger.debug('Converting output', {
      format,
      nodeCount: nodes.length,
      options: opts
    });

    const formatter = this.formatters.get(format);
    if (!formatter) {
      throw new MeldOutputError(`Unsupported format: ${format}`, format);
    }

    try {
      const result = await formatter(nodes, state, opts);
      
      logger.debug('Successfully converted output', {
        format,
        resultLength: result.length
      });

      return result;
    } catch (error) {
      logger.error('Failed to convert output', {
        format,
        error
      });

      if (error instanceof MeldOutputError) {
        throw error;
      }

      throw new MeldOutputError(
        'Failed to convert output',
        format,
        error instanceof Error ? error : undefined
      );
    }
  }

  registerFormat(
    format: string,
    converter: (nodes: MeldNode[], state: IStateService, options?: OutputOptions) => Promise<string>
  ): void {
    if (!format || typeof format !== 'string') {
      throw new Error('Format must be a non-empty string');
    }
    if (typeof converter !== 'function') {
      throw new Error('Converter must be a function');
    }

    this.formatters.set(format, converter);
    logger.debug('Registered format converter', { format });
  }

  supportsFormat(format: string): boolean {
    return this.formatters.has(format);
  }

  getSupportedFormats(): string[] {
    return Array.from(this.formatters.keys());
  }

  private async convertToMarkdown(
    nodes: MeldNode[],
    state: IStateService,
    options: Required<OutputOptions>
  ): Promise<string> {
    try {
      let output = '';

      // Add state variables if requested
      if (options.includeState) {
        output += this.formatStateVariables(state);
        if (nodes.length > 0) {
          output += '\n\n';
        }
      }

      // Process nodes
      for (const node of nodes) {
        output += await this.nodeToMarkdown(node, options);
      }

      // Clean up extra newlines if not preserving formatting
      if (!options.preserveFormatting) {
        output = output.replace(/\n{3,}/g, '\n\n').trim();
      }

      return output;
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert to markdown',
        'markdown',
        error instanceof Error ? error : undefined
      );
    }
  }

  private async convertToLLMXML(
    nodes: MeldNode[],
    state: IStateService,
    options: Required<OutputOptions>
  ): Promise<string> {
    try {
      let output = '<meld>';

      // Add state variables if requested
      if (options.includeState) {
        output += '\n  <state>';
        output += await this.stateToXML(state);
        output += '\n  </state>';
      }

      // Process nodes
      if (nodes.length > 0) {
        output += '\n  <content>';
        for (const node of nodes) {
          output += await this.nodeToXML(node, options);
        }
        output += '\n  </content>';
      }

      output += '\n</meld>';

      // Clean up extra newlines if not preserving formatting
      if (!options.preserveFormatting) {
        output = output.replace(/\n{3,}/g, '\n\n').trim();
      }

      return output;
    } catch (error) {
      throw new MeldOutputError(
        'Failed to convert to LLM XML',
        'llm',
        error instanceof Error ? error : undefined
      );
    }
  }

  // Helper methods for state formatting
  private formatStateVariables(state: IStateService): string {
    // ... implementation ...
  }

  private async nodeToMarkdown(
    node: MeldNode,
    options: Required<OutputOptions>
  ): Promise<string> {
    // ... implementation ...
  }

  private async nodeToXML(
    node: MeldNode,
    options: Required<OutputOptions>
  ): Promise<string> {
    // ... implementation ...
  }

  private async stateToXML(state: IStateService): Promise<string> {
    // ... implementation ...
  }
}
```

────────────────────────────────────────────────────────────────────────
IV. TESTING STRATEGY
────────────────────────────────────────────────────────────────────────

Our tests focus on proper integration with llmxml and correct format selection:

--------------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { OutputService } from './OutputService';
import { MeldNode } from 'meld-spec';

describe('OutputService', () => {
  let service: OutputService;

  beforeEach(() => {
    service = new OutputService();
  });

  it('converts to markdown', () => {
    const nodes: MeldNode[] = [
      { type: 'Text', content: 'Hello', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } } }
    ];
    const result = service.convert(nodes, new InterpreterState(), 'md');
    expect(result).toBe('Hello');
  });

  it('converts to LLM XML using llmxml', () => {
    const nodes: MeldNode[] = [
      { type: 'Text', content: 'Hello', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } } }
    ];
    const result = service.convert(nodes, new InterpreterState(), 'llm');
    // Expect llmxml's output format
    expect(result).toContain('<text>Hello</text>');
  });
});
--------------------------------------------------------------------------------

Integration tests verify the entire pipeline:

--------------------------------------------------------------------------------
describe('OutputService Integration', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();
  });

  it('produces correct LLM XML for a complex document', async () => {
    await context.builder.create({
      files: {
        'test.meld': `
          Some text
          @text greeting = "Hello"
          More text
        `
      }
    });

    const result = await runMeld('test.meld', { format: 'llm' });
    // Verify llmxml produced the expected structure
    expect(result).toMatch(/<text>[\s\S]*<\/text>/);
  });
});
--------------------------------------------------------------------------------

────────────────────────────────────────────────────────────────────────
V. ADVANTAGES OF THIS APPROACH
────────────────────────────────────────────────────────────────────────

By leveraging llmxml instead of building our own XML conversion:

1. We get battle-tested LLM XML conversion
2. We maintain compatibility with the broader Meld ecosystem
3. We focus only on the "glue" code needed to integrate llmxml
4. We can easily adopt llmxml updates/improvements
5. We keep our codebase lean and maintainable

The OutputService becomes primarily an integration point rather than implementing complex conversion logic itself.

────────────────────────────────────────────────────────────────────────
VI. FUTURE CONSIDERATIONS
────────────────────────────────────────────────────────────────────────

1. New Output Formats
   • Add new format handlers in formats/
   • But prefer to contribute to llmxml for LLM-related changes

2. Format Options
   • Pass through llmxml options when needed
   • Add minimal custom options for our formats

3. Performance
   • Let llmxml handle optimization for XML conversion
   • Focus on efficient integration rather than optimization

────────────────────────────────────────────────────────────────────────
VII. CONCLUSION
────────────────────────────────────────────────────────────────────────

This design for OutputService:

1. Properly leverages llmxml instead of rebuilding XML conversion
2. Keeps our code focused on integration rather than implementation
3. Maintains compatibility with the Meld ecosystem
4. Provides a clean, service-oriented interface
5. Remains easily testable and maintainable

By relying on llmxml for the complex work of XML conversion, we can focus on providing a great service interface while standing on the shoulders of the core Meld libraries.
