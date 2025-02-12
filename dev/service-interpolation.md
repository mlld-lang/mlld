# InterpolationService

Below is a detailed design for the InterpolationService that aligns with meld-spec's type definitions and the Meld grammar. This service handles variable expansions (${textVar}, #{dataVar}, etc.) while ensuring type safety and compatibility with the core Meld libraries.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I. OVERVIEW & ROLE IN THE ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The InterpolationService is responsible for expanding all variable references like:
• ${textVar}[>>(format)] - using meld-spec's TextVariable type  
• #{dataVar.field}[>>(format)] - using meld-spec's DataVariable type  
• $path, $HOMEPATH, $PROJECTPATH - using meld-spec's PathVariable type

It is purely about string transformations and variable lookups:  
• Every snippet ("${myText} is here" or "`some ${myVar} stuff`") that references Meld variables is replaced with actual values.  
• The InterpolationService never writes to disk or manipulates the AST.  
• It's invoked by directive handlers whenever they need raw directive arguments to be fully expanded.

ASCII Context Diagram:

        ┌─────────────────────────┐
        │   Some Directive        │
        │  e.g. @text or @import  │
        └──────────────┬──────────┘
                       │ calls:
                       ▼
            ┌──────────────────────────────┐
            │ InterpolationService         │
            │  - uses meld-spec types      │
            │  - expands variables         │
            └──────────────┬───────────────┘
                           │  queries:
                           ▼
        ┌──────────────────────────────┐
        │ StateService (for text/data) │
        │ PathService  (for path vars) │
        └──────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
II. USE CASE EXAMPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• A directive has something like:
   @text greeting = "Hello, ${userName}!"
  The TextDirectiveHandler calls interpolationService.resolveString('Hello, ${userName}!'):
    → sees ${userName}
    → calls stateService.getTextVar('userName') → e.g. "Alice"
    → final result: "Hello, Alice!"

• Another directive has:
   @run [cp ${sourceFile} /dest/${targetFile}]
  The RunDirectiveHandler calls interpolationService.resolveString('cp ${sourceFile} /dest/${targetFile}'):
    → expands the ${} references from text vars
    → final command might be "cp app.js /dest/final.js"

• Data variables (#{config.field}) get stringified if they are objects:
   "Api call to #{config.apiUrl}"
   If config.apiUrl == "http://example.com", that becomes "Api call to http://example.com"

• Missing variables follow meld-spec's rules:
  - Missing data fields return empty string
  - Missing environment variables return empty string
  - Missing text variables can be configured (empty or throw)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
III. CODE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recommended directory layout:

services/
 ├─ InterpolationService/
 │   ├─ InterpolationService.ts
 │   ├─ InterpolationService.test.ts
 │   └─ README.md (optional short doc)
 └─ (other services)...

Inside InterpolationService.ts:

--------------------------------------------------------------------------------
import { TextVariable, DataVariable, PathVariable } from 'meld-spec';
import { StateService } from '../StateService/StateService';
import { PathService } from '../PathService/PathService';
import { FormatService } from '../FormatService/FormatService';

export type InterpContext = 'text' | 'data' | 'path' | 'command';

export class InterpolationService {
  constructor(
    private stateService: StateService,
    private pathService: PathService,
    private formatService?: FormatService
  ) {}

  public resolveString(original: string, context: InterpContext): string {
    let result = original;

    // Handle ${textVar} expansions
    result = this.expandTextVars(result);

    // Handle #{dataVar.field} expansions
    result = this.expandDataVars(result);

    // Handle $PROJECTPATH etc in path contexts
    if (context === 'path') {
      result = this.expandPathVars(result);
    }

    return result;
  }

  private expandTextVars(input: string): string {
    return input.replace(/\${([^}]+)}/g, (match, varName) => {
      const value = this.stateService.getTextVar(varName);
      if (value === undefined) {
        // Follow meld-spec rules for missing vars
        return '';
      }
      return value;
    });
  }

  private expandDataVars(input: string): string {
    return input.replace(/#{([^}]+)}/g, (match, path) => {
      const [varName, ...fields] = path.split('.');
      const value = this.stateService.getDataVar(varName);
      if (value === undefined) {
        return '';
      }
      // Handle nested field access
      let result = value;
      for (const field of fields) {
        result = result?.[field];
        if (result === undefined) {
          return '';
        }
      }
      // Convert objects to JSON string per meld-spec
      return typeof result === 'object' ? JSON.stringify(result) : String(result);
    });
  }

  private expandPathVars(input: string): string {
    // Handle $PROJECTPATH, $HOMEPATH etc
    return this.pathService.expandPathVars(input);
  }
}
--------------------------------------------------------------------------------

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IV. TESTING STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Unit Tests (InterpolationService.test.ts):

--------------------------------------------------------------------------------
import { describe, it, expect, beforeEach } from 'vitest';
import { InterpolationService } from './InterpolationService';
import { TextVariable, DataVariable } from 'meld-spec';

describe('InterpolationService', () => {
  let service: InterpolationService;
  let mockStateService: any;
  let mockPathService: any;

  beforeEach(() => {
    mockStateService = {
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
    };
    mockPathService = {
      expandPathVars: vi.fn(),
    };
    service = new InterpolationService(mockStateService, mockPathService);
  });

  it('expands text variables', () => {
    mockStateService.getTextVar.mockReturnValue('Alice');
    const result = service.resolveString('Hello ${name}!', 'text');
    expect(result).toBe('Hello Alice!');
  });

  it('expands data variables with field access', () => {
    mockStateService.getDataVar.mockReturnValue({ url: 'example.com' });
    const result = service.resolveString('Site: #{config.url}', 'text');
    expect(result).toBe('Site: example.com');
  });

  it('follows meld-spec rules for missing variables', () => {
    mockStateService.getTextVar.mockReturnValue(undefined);
    const result = service.resolveString('${missing}', 'text');
    expect(result).toBe('');
  });
});
--------------------------------------------------------------------------------

Integration Tests:

--------------------------------------------------------------------------------
describe('InterpolationService Integration', () => {
  let context: TestContext;
  let service: InterpolationService;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();

    // Create test files and state
    context.builder.create({
      files: {
        'test.meld': `
          @text name = "Alice"
          @data config = { "url": "example.com" }
          Message: ${name} at #{config.url}
        `
      }
    });

    const stateService = new StateService();
    const pathService = new PathService();
    service = new InterpolationService(stateService, pathService);
  });

  it('expands variables in a complex document', async () => {
    // Set up some variables
    stateService.setTextVar('name', 'Alice');
    stateService.setDataVar('config', { url: 'example.com' });

    const template = 'Hello ${name} at #{config.url}';
    const result = service.resolveString(template, 'text');
    expect(result).toBe('Hello Alice at example.com');
  });
});
--------------------------------------------------------------------------------

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
V. ADVANTAGES OF THIS DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Type Safety
   • Uses meld-spec's variable types
   • Ensures compatibility with the grammar
   • Makes refactoring safer

2. Clear Separation
   • Interpolation logic isolated from other concerns
   • Each variable type handled separately
   • Easy to add new variable types

3. Testability
   • Pure string transformation
   • Easy to mock dependencies
   • Clear expected outputs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VI. FUTURE CONSIDERATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Format Operators
   • Support for >>(format) operators
   • Possibly delegate to FormatService
   • Keep aligned with meld-spec

2. Performance
   • Cache compiled regex patterns
   • Optimize for large documents
   • Consider streaming for huge files

3. Error Handling
   • Better error messages for invalid syntax
   • Optional strict mode
   • Debug logging

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VII. CONCLUSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This InterpolationService design:

1. Properly uses meld-spec's types
2. Follows the Meld grammar rules
3. Keeps interpolation logic isolated
4. Provides clear testing patterns
5. Remains extensible for future needs

By leveraging meld-spec's types and following the grammar rules, we create a robust service that fits perfectly into the Meld ecosystem while remaining maintainable and testable.
