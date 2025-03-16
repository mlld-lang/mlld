# Comprehensive Plan: Standardize on Output-Literal Mode and Add Prettier Integration

## 1. Current State Assessment

The Meld codebase currently has two distinct output modes:

1. **Output-Literal Mode** (also called transformation mode):
   - Preserves exact document structure
   - Maintains all newlines and spacing from the source
   - Currently the default for both CLI and API
   - Implemented as conditional branches in OutputService

2. **Output-Normalized Mode** (when transformation is disabled):
   - Applies custom markdown formatting rules
   - Normalizes newlines and spacing
   - Implemented as separate code paths in OutputService
   - Currently not accessible via CLI and optional in API

**Issues with current implementation:**
- Dual terminology creates confusion (transformation vs output-literal)
- Maintaining two code paths increases complexity
- API layer still contains regex-based workarounds
- Custom formatting rules duplicate functionality available in standard tools
- No standardized pretty-printing option

## 2. Proposed Solution

1. **Standardize on a single output mode** (output-literal/transformation mode)
2. **Add Prettier integration** for optional formatting
3. **Remove all API layer workarounds**
4. **Establish consistent terminology** throughout the codebase
5. **Simplify the OutputService implementation**

By implementing this plan, we will:
- Simplify the codebase by eliminating dual output modes
- Leverage industry-standard Prettier for formatting
- Remove regex-based workarounds in the API layer
- Use consistent terminology throughout the code
- Make the system more maintainable and easier to understand

## 3. Implementation Phases

### Phase 1: Add Prettier Integration While Maintaining Dual Modes

#### 1.1 Add Dependencies
```bash
npm install prettier @prettier/plugin-markdown --save
```

#### 1.2 Create Prettier Utility
Create a utility file `/Users/adam/dev/claude-meld/core/utils/prettierUtils.ts`:
```typescript
import prettier from 'prettier';

/**
 * Format content with Prettier
 * 
 * @param content The content to format
 * @param parser The parser to use (markdown, json, etc.)
 * @returns The formatted content
 */
export async function formatWithPrettier(content: string, parser: 'markdown' | 'json' = 'markdown'): Promise<string> {
  try {
    return await prettier.format(content, {
      parser,
      // Use consistent settings for markdown
      proseWrap: 'preserve',
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      bracketSpacing: true,
      arrowParens: 'avoid',
    });
  } catch (error) {
    // If prettier fails, return the original content
    console.warn('Prettier formatting failed:', error);
    return content;
  }
}
```

#### 1.3 Update Core Types
Update `/Users/adam/dev/claude-meld/core/types/index.ts`:
```typescript
export interface ProcessOptions {
  /** 
   * Controls whether directives should be transformed 
   * Can be a boolean for all-or-nothing transformation, or an object with selective options
   */
  transformation?: boolean | TransformationOptions;
  /** Controls output format */
  format?: OutputFormat;
  /** Enables/disables debugging */
  debug?: boolean;
  /** Optional custom filesystem */
  fs?: NodeFileSystem;
  /** Optional service overrides */
  services?: Partial<Services>;
  /** Controls whether to apply Prettier formatting to the output */
  pretty?: boolean;
}
```

#### 1.4 Update Output Interface
Update `/Users/adam/dev/claude-meld/services/pipeline/OutputService/IOutputService.ts`:
```typescript
interface OutputOptions {
  /**
   * Whether to include state variables in the output.
   * When true, variable definitions are included as comments or metadata.
   * @default false
   */
  includeState?: boolean;

  /**
   * Whether to preserve original formatting (whitespace, newlines).
   * When true, maintains document structure; when false, may compact output.
   * @default true
   */
  preserveFormatting?: boolean;

  /**
   * Whether to apply Prettier formatting to the output.
   * When true, the output is formatted according to Prettier rules.
   * @default false
   */
  pretty?: boolean;

  /**
   * Custom format-specific options.
   * Additional options passed to specific format converters.
   */
  formatOptions?: Record<string, unknown>;
}
```

#### 1.5 Update OutputService Implementation
Update `/Users/adam/dev/claude-meld/services/pipeline/OutputService/OutputService.ts`:
```typescript
// Add import for the prettier utility
import { formatWithPrettier } from '@core/utils/prettierUtils.js';

// Update the convert method to apply Prettier when requested
public async convert(
  nodes: MeldNode[],
  state: IStateService,
  format: OutputFormat = 'markdown',
  options?: OutputOptions
): Promise<string> {
  // This is the current implementation with whatever logic is there
  let output = await this.convertToFormat(nodes, state, format, options);
  
  // Apply Prettier formatting if requested
  if (options?.pretty) {
    // Use the correct parser based on the format
    const parser = format === 'xml' ? 'html' : 'markdown';
    return await formatWithPrettier(output, parser as 'markdown' | 'json');
  }
  
  return output;
}
```

#### 1.6 Update CLI
Update `/Users/adam/dev/claude-meld/cli/index.ts`:
```typescript
// Add pretty option to CLIOptions interface
export interface CLIOptions {
  // ... existing options
  pretty?: boolean;
}

// Update parseArgs function to handle the pretty flag
function parseArgs(args: string[]): CLIOptions {
  // ... existing code

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      // ... existing cases
      case '--pretty':
        options.pretty = true;
        break;
      // ... other cases
    }
  }
  
  return options;
}

// Update cliToApiOptions function to pass the pretty flag
function cliToApiOptions(cliOptions: CLIOptions): ProcessOptions {
  const options: ProcessOptions = {
    format: normalizeFormat(cliOptions.format),
    debug: cliOptions.debug,
    // Always transform by default
    transformation: true,
    fs: cliOptions.custom ? undefined : new NodeFileSystem(),
    // Add pretty option
    pretty: cliOptions.pretty
  };
  
  // ... rest of the function
  return options;
}

// Update displayHelp function to document the pretty flag
function displayHelp(command?: string) {
  // ... existing code
  
  console.log(`
Usage: meld [command] [options] <input-file>

Commands:
  init                    Create a new Meld project
  debug-resolution        Debug variable resolution in a Meld file
  debug-transform         Debug node transformations through the pipeline

Options:
  -f, --format <format>   Output format: md, markdown, xml, llm [default: llm]
  -o, --output <path>     Output file path
  --stdout                Print to stdout instead of file
  --strict                Enable strict mode (fail on all errors)
  --permissive            Enable permissive mode (ignore recoverable errors) [default]
  --pretty                Format the output with Prettier
  --home-path <path>      Custom home path for ~/ substitution
  -v, --verbose           Enable verbose output (some additional info)
  -d, --debug             Enable debug output (full verbose logging)
  -w, --watch             Watch for changes and reprocess
  -h, --help              Display this help message
  -V, --version           Display version information
  `);
}
```

#### 1.7 Update API run-meld.ts
Update `/Users/adam/dev/claude-meld/api/run-meld.ts`:
```typescript
export async function runMeld(
  content: string,
  options: Partial<ProcessOptions> = {}
): Promise<string> {
  // ... existing code

  // Default options
  const defaultOptions: ProcessOptions = {
    format: 'markdown',
    transformation: true,
    fs: memoryFS,
    // Default to no pretty formatting
    pretty: false
  };
  
  // Merge options
  const mergedOptions: ProcessOptions = { ...defaultOptions, ...options };
  
  // ... existing code

  try {
    // ... existing code
    
    // Convert to desired format
    let converted = await services.output.convert(nodesToProcess, resultState, outputFormat, {
      // Pass the pretty option to the output service
      pretty: mergedOptions.pretty
    });
    
    // Remove all the post-processing workarounds, as they're no longer needed
    // The formatting is now handled by either the OutputService for literal output
    // or by Prettier for pretty output
    
    return converted;
  } catch (error) {
    // ... existing error handling
  }
}
```

#### 1.8 Add Initial Tests

Create a new test file for Prettier utils:
```typescript
// Create a new file: /Users/adam/dev/claude-meld/core/utils/prettierUtils.test.ts
import { formatWithPrettier } from './prettierUtils';
import { describe, it, expect } from 'vitest';

describe('Prettier Utils', () => {
  it('should format markdown content', async () => {
    const unformatted = `# Heading\n  - Item 1\n  - Item 2\n\n\n\nText with      extra      spaces`;
    const formatted = await formatWithPrettier(unformatted, 'markdown');
    
    expect(formatted).toContain('# Heading');
    expect(formatted).toContain('- Item 1');
    expect(formatted).toContain('- Item 2');
    expect(formatted).not.toContain('\n\n\n');
    expect(formatted).not.toContain('Text with      extra      spaces');
  });
  
  it('should format JSON content', async () => {
    const unformatted = `{"key":"value","nested":{"prop1":"val1","prop2":"val2"}}`;
    const formatted = await formatWithPrettier(unformatted, 'json');
    
    expect(formatted).toContain('"key": "value"');
    expect(formatted).toContain('"nested": {');
    expect(formatted).toContain('"prop1": "val1"');
  });
  
  it('should handle invalid content gracefully', async () => {
    // Invalid markdown shouldn't cause problems
    const invalidMarkdown = `# Heading\n{% invalid %}`;
    const formattedMarkdown = await formatWithPrettier(invalidMarkdown, 'markdown');
    
    // Should return something reasonable, or the original content
    expect(formattedMarkdown).toBeTruthy();
    expect(formattedMarkdown).toContain('# Heading');
  });
});
```

Add tests to OutputService.test.ts:
```typescript
// Add to /Users/adam/dev/claude-meld/services/pipeline/OutputService/OutputService.test.ts
describe('Prettier Integration', () => {
  it('should format output with Prettier when pretty option is true', async () => {
    // Create nodes with unformatted content
    const nodes = [
      createTextNode('# Heading\n  - Item 1\n  - Item 2\n\n\n\nText with      extra      spaces', 
        createLocation(1, 1))
    ];
    
    vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
    
    // Apply Prettier formatting
    const output = await service.convert(nodes, state, 'markdown', {
      pretty: true
    });
    
    // Expect formatted output
    expect(output).toContain('# Heading');
    expect(output).toContain('- Item 1');
    expect(output).toContain('- Item 2');
    // Prettier should normalize multiple newlines
    expect(output).not.toContain('\n\n\n');
  });
  
  it('should handle code blocks correctly when formatting with Prettier', async () => {
    // Create nodes with code blocks
    const fenceContent = '```javascript\nconst x  =  1;\nconst y=2;\n```';
    const nodes = [
      createTextNode('Text before code\n', createLocation(1, 1)),
      createCodeFenceNode(fenceContent, 'javascript', createLocation(2, 1)),
      createTextNode('\nText after code', createLocation(4, 1))
    ];
    
    vi.mocked(state.getTransformedNodes).mockReturnValue(nodes);
    
    // Format with Prettier
    const output = await service.convert(nodes, state, 'markdown', {
      pretty: true
    });
    
    // Expect code block formatting
    expect(output).toContain('```javascript');
    // Prettier should format code within blocks
    expect(output).toContain('const x = 1;');
    expect(output).toContain('const y = 2;');
  });
});
```

### Phase 2: Remove Output-Normalized Mode

#### 2.1 Update OutputService Implementation
Remove the output-normalized mode code paths from `/Users/adam/dev/claude-meld/services/pipeline/OutputService/OutputService.ts`:

1. Update `convertToMarkdown` method to use only the output-literal mode path
2. Update `nodeToMarkdown` method to remove special handling for non-transformation mode
3. Update `handleNewlines` method to always use the literal mode behavior
4. Update any other methods with conditional branches for transformation mode

Example:
```typescript
private async convertToMarkdown(
  nodes: MeldNode[],
  state: IStateService,
  options?: OutputOptions
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  try {
    let output = '';

    // Debug: Log node types
    logger.debug('Converting nodes to markdown', {
      nodeCount: nodes.length,
      nodeTypes: nodes.map(n => n.type),
      isOutputLiteral: true // Always true now
    });

    // Add state variables if requested
    if (opts.includeState) {
      output += this.formatStateVariables(state);
      if (nodes.length > 0) {
        output += '\n\n';
      }
    }

    // Process nodes preserving exact layout
    for (const node of nodes) {
      try {
        const nodeOutput = await this.nodeToMarkdown(node, state);
        if (\!nodeOutput) continue;
        output += nodeOutput;
      } catch (nodeError) {
        logger.error('Error converting node', {
          nodeType: node.type,
          location: node.location,
          error: nodeError
        });
        throw nodeError;
      }
    }
    
    return output;
  } catch (error) {
    throw new MeldOutputError(
      'Failed to convert to markdown',
      'markdown',
      { cause: error instanceof Error ? error : undefined }
    );
  }
}
```

#### 2.2 Remove run-meld.ts Workarounds
Remove the regex-based workarounds in `/Users/adam/dev/claude-meld/api/run-meld.ts`:

```typescript
try {
  // ... existing code
  
  // Convert to desired format
  let converted = await services.output.convert(nodesToProcess, resultState, outputFormat, {
    // Pass the pretty option to the output service
    pretty: mergedOptions.pretty
  });
  
  // No post-processing workarounds needed
  return converted;
} catch (error) {
  // ... existing error handling
}
```

#### 2.3 Update Tests
Update all tests that check non-transformation mode behavior:

1. Remove all test cases that explicitly test output-normalized mode
2. Update all tests to only verify output-literal mode behavior
3. Add more tests for Prettier as the replacement for output-normalized mode

Files to update:
- OutputService.test.ts: Remove lines 306-338 (non-transformation mode tests)
- All transformation mode tests in various test files
- Update test comments to use consistent terminology

#### 2.4 Update IStateService Interface
Update the transformation-related methods in the IStateService interface to reflect that transformation is now always enabled:

```typescript
// In /Users/adam/dev/claude-meld/services/state/StateService/IStateService.ts

// Either update these methods to be non-optional:
getTransformedNodes(): MeldNode[];

// Or consider adding default implementations that always return true:
isTransformationEnabled(): boolean {
  return true;
}
```

### Phase 3: Standardize Terminology

#### 3.1 Choose Consistent Terminology
Select one term to use consistently throughout the codebase:
- Recommendation: Use "transformation" as it's more descriptive of what's happening

#### 3.2 Update Method Names and Comments
Update method names, variables, and comments to use consistent terminology:

1. Rename `isOutputLiteral` to `isTransformation` or vice versa
2. Update all comments referencing "output-literal" or "output-normalized"
3. Update documentation to use consistent terminology

#### 3.3 Update Interface Documentation
Update interface documentation to reflect the new approach:

```typescript
/**
 * Service responsible for converting Meld AST nodes into different output formats.
 * Handles transformation of Meld content for final output.
 * 
 * @remarks
 * The OutputService is the final stage in the Meld processing pipeline. It takes
 * the processed AST nodes and state, and converts them into a specific output format
 * like Markdown or XML.
 * 
 * In transformation mode (the only mode):
 * - Directives are replaced with their transformed results
 * - Original document formatting is preserved
 * - Optional Prettier formatting can be applied with the `pretty` option
 * 
 * Dependencies:
 * - IStateService: For accessing state and transformed nodes
 */
```

## 4. Testing Strategy

### 4.1 Phase 1 Testing
- Add tests for Prettier utility functions
- Add tests for Prettier option in OutputService
- Add tests for Prettier integration in API and CLI
- Maintain existing tests for both output modes

### 4.2 Phase 2 Testing
- Remove output-normalized mode tests
- Update remaining tests to focus on output-literal mode
- Add tests to verify Prettier as a replacement for output-normalized mode
- Ensure all existing functionality works with only output-literal mode

### 4.3 Phase 3 Testing
- Update test names and comments to use consistent terminology
- Ensure all test expectations match the new implementation
- Verify no regressions in functionality

### 4.4 New Tests to Add

- Prettier utility tests:
  - Basic formatting tests
  - Tests with different content types (markdown, code blocks)
  - Error handling tests

- OutputService tests:
  - Tests for the pretty option
  - Tests for combinations of options (pretty + preserveFormatting)
  - Performance tests for large documents

- API tests:
  - Tests for the pretty option in runMeld
  - Tests for complex documents with Prettier

- CLI tests:
  - Tests for the --pretty flag
  - Tests for flag combinations

## 5. Implementation Order and Dependencies

1. **Phase 1: Add Prettier Support**
   - Add Prettier dependency (prerequisite for all other changes)
   - Implement Prettier utility (prerequisite for OutputService changes)
   - Update interfaces and add pretty option
   - Add tests for Prettier integration

2. **Phase 2: Remove Output-Normalized Mode**
   - Wait for Phase 1 to be complete and tested
   - Remove output-normalized code paths
   - Remove API workarounds
   - Update tests

3. **Phase 3: Standardize Terminology**
   - Wait for Phases 1 and 2 to be complete
   - Update terminology consistently
   - Update documentation and comments

## 6. Backwards Compatibility

The changes maintain backwards compatibility:
- All existing code using transformation mode will continue to work
- Users relying on output-normalized mode can use the new pretty option
- The API signature remains backward compatible with existing code

## 7. Documentation Updates

Documentation will need to be updated to reflect:
1. The removal of output-normalized mode
2. The addition of the pretty option
3. The standardized terminology
4. The simplified architecture
5. Examples of using the pretty option for formatting

## 8. Example Usage

#### CLI Usage:
```bash
# Standard transformation (preserves exact formatting)
meld input.meld

# Transformation with Prettier formatting
meld --pretty input.meld
```

#### API Usage:
```typescript
// Standard transformation (preserves exact formatting)
const result = await runMeld(content);

// Transformation with Prettier formatting
const prettyResult = await runMeld(content, { pretty: true });
```

## 9. Conclusion

This plan simplifies the Meld codebase by standardizing on a single output mode (transformation/output-literal) and adding Prettier for optional formatting. The changes improve maintainability, remove workarounds, and establish consistent terminology while preserving backward compatibility.

The implementation approach involves three phases:
1. Add Prettier integration while maintaining both modes
2. Remove output-normalized mode code paths
3. Standardize terminology throughout the codebase

Each phase includes detailed code changes, test updates, and validation steps to ensure a smooth transition.
