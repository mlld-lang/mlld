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
 │   ├─ OutputService.ts
 │   ├─ OutputService.test.ts
 │   └─ formats/
 │       ├─ MarkdownOutput.ts     # Simple MD conversion
 │       └─ LLMOutput.ts         # Wraps llmxml

Example implementation:

--------------------------------------------------------------------------------
// services/OutputService/OutputService.ts
import { MeldNode } from 'meld-spec';
import { convertToXml } from 'llmxml';
import { InterpreterState } from '../StateService/InterpreterState';
import { MarkdownOutput } from './formats/MarkdownOutput';
import { LLMOutput } from './formats/LLMOutput';

export type OutputFormat = 'md' | 'llm';

export class OutputService {
  constructor(
    private markdownOutput = new MarkdownOutput(),
    private llmOutput = new LLMOutput()
  ) {}

  public convert(nodes: MeldNode[], state: InterpreterState, format: OutputFormat): string {
    switch (format) {
      case 'md':
        return this.markdownOutput.convert(nodes, state);
      case 'llm':
        return this.llmOutput.convert(nodes, state);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}

// services/OutputService/formats/LLMOutput.ts
import { convertToXml } from 'llmxml';

export class LLMOutput {
  public convert(nodes: MeldNode[], state: InterpreterState): string {
    // Use llmxml's conversion, possibly with some pre/post processing
    return convertToXml(nodes, {
      // Any llmxml options we need
    });
  }
}

// services/OutputService/formats/MarkdownOutput.ts
export class MarkdownOutput {
  public convert(nodes: MeldNode[], state: InterpreterState): string {
    // Simple conversion to Markdown
    // Most nodes can remain as-is
    const lines: string[] = [];
    for (const node of nodes) {
      if (node.type === 'Text') {
        lines.push(node.content);
      }
      // Handle other node types...
    }
    return lines.join('\n');
  }
}
--------------------------------------------------------------------------------

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
