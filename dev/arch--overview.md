Below is a services-based architecture that leverages core Meld libraries (meld-ast, llmxml, meld-spec) and follows SOLID principles. This design ensures compatibility with the Meld ecosystem while maintaining clean separation of concerns.

─────────────────────────────────────────────────────────────────────────
  CORE LIBRARIES & TYPES
─────────────────────────────────────────────────────────────────────────

1. meld-spec (Type Definitions)
   • Core Node Types:
     - MeldNode - Base interface for all AST nodes
     - DirectiveNode - AST node for directives
     - TextNode - AST node for text content
     - CodeFenceNode - AST node for code fences
   • Variable Types:
     - TextVariable - For @text directives and ${var} interpolation
     - DataVariable - For @data directives and #{data.field} interpolation
     - PathVariable - For @path directives and $path references
   • Command Types:
     - CommandDefinition - For @define directives
     - CommandMetadata - Command metadata and risk levels
   • Validation Types:
     - ValidationError - For structured error reporting
     - ValidationContext - For validation state
     - ValidationResult - For validation outcomes

2. meld-ast (Parsing)
   • Provides parse() function for converting text to AST
   • Returns MeldNode[] using meld-spec types
   • Handles code fences, directives, and text nodes
   • Used only in ParserService for AST generation

3. llmxml (XML Conversion)
   • Handles bidirectional conversion between Markdown and LLM-XML (llm-friendly pseudo-xml)
   • Used in OutputService for final formatting
   • Handles markdown section extraction with fuzzy matching
   • Provides configurable warning system for ambiguous matches
   • Includes typed error handling for various failure conditions

─────────────────────────────────────────────────────────────────────────
  OVERVIEW & KEY GOALS
─────────────────────────────────────────────────────────────────────────

1. Leverage Core Libraries
   • Use meld-spec for ALL type definitions
   • Use meld-ast ONLY for parsing text to AST
   • Use llmxml for XML/section extraction
   • Never reimplement functionality from core libraries

2. Isolate Complex Features
   • Each service has a single responsibility
   • Services communicate through well-defined interfaces
   • Complex operations are delegated to appropriate libraries

3. Clean Directive Logic
   • Each directive handler is focused and testable
   • Handlers use services for complex operations
   • No direct file I/O or parsing in handlers

4. Future-Proof Design
   • Easy to add new directives
   • Easy to extend existing services
   • Clean integration with core libraries

5. Maintainability First
   • Clear separation of concerns
   • Comprehensive test coverage
   • Consistent error handling

─────────────────────────────────────────────────────────────────────────
  HIGH-LEVEL FLOW
─────────────────────────────────────────────────────────────────────────

A typical Meld usage scenario:

   ┌─────────────────────────────────────┐
   │         Input Meld Document        │
   │   (myfile.meld or similar)         │
   └─────────────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────┐
   │ ParserService: Parse text into AST │
   └─────────────────────────────────────┘
                    │ AST (MeldNode[])
                    ▼
   ┌────────────────────────────────────────────────────┐
   │ InterpreterService: For each node, route to       │
   │   the DirectiveService & supporting services      │
   └────────────────────────────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────┐
   │ DirectiveService: Routes to:       │
   ├─────────────────────────────────────┤
   │ Definition Handlers:               │──┐
   │ • @text, @data, @path, @define    │  │
   ├─────────────────────────────────────┤  │
   │ Execution Handlers:                │  │
   │ • @run, @embed, @import           │  │
   └─────────────────────────────────────┘  │
                    │                       │
                    ▼                       ▼
   ┌─────────────────────────────────┐    ┌─────────────────────────────┐
   │ ResolutionService:             │    │ StateService:               │
   │ • Variable resolution          │◄───│ • Raw variable storage      │
   │ • Command resolution          │    │ • No resolution logic       │
   │ • Path resolution             │    │ • State hierarchy          │
   └─────────────────────────────────┘    └─────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────────────┐
   │ OutputService: Converts final state/AST to desired  │
   │   format (markdown, llm XML, or others)             │
   └─────────────────────────────────────────────────────┘

─────────────────────────────────────────────────────────────────────────
  CODEBASE STRUCTURE
─────────────────────────────────────────────────────────────────────────

A recommended directory layout that emphasizes core library integration:

project-root/
├─ core/
│  ├─ errors/
│  │  ├─ MeldError.ts         # Base custom error classes
│  │  └─ ErrorFactory.ts      # Central creation for typed errors
│  ├─ types/
│  │  └─ SpecInterfaces.ts    # Re-exports from meld-spec
│  └─ utils/
│     ├─ logger.ts            # Winston or other logging
│     └─ helpers.ts           # Common small utilities
├─ services/
│  ├─ PathService/
│  │  ├─ PathService.ts       # Uses meld-spec PathVariable type
│  │  └─ PathService.test.ts  # Unit tests
│  ├─ FileSystemService/
│  │  ├─ FileSystemService.ts # Abstract read/write to disk, mocking
│  │  └─ ...
│  ├─ CircularityService/
│  │  ├─ CircularityService.ts # Tracks imports, detects cycles
│  │  └─ ...
│  ├─ ValidationService/
│  │  ├─ ValidationService.ts  # Uses meld-spec for validation
│  │  └─ ...
│  ├─ StateService/
│  │  ├─ StateService.ts       # Uses meld-spec variable types
│  │  └─ ...
│  ├─ InterpolationService/
│  │  ├─ InterpolationService.ts # Variable expansion with meld-spec types
│  │  └─ ...
│  ├─ DirectiveService/
│  │  ├─ DirectiveService.ts   # Routes directives to handlers
│  │  ├─ handlers/
│  │  │  ├─ TextDirectiveHandler.ts
│  │  │  ├─ DataDirectiveHandler.ts
│  │  │  ├─ EmbedDirectiveHandler.ts
│  │  │  ├─ ImportDirectiveHandler.ts
│  │  │  ├─ PathDirectiveHandler.ts
│  │  │  └─ ...
│  │  └─ ...
│  └─ ...
├─ parser/
│  ├─ ParserService.ts       # Wraps meld-ast for parsing
│  └─ ...
├─ interpreter/
│  ├─ InterpreterService.ts  # Uses meld-ast nodes
│  └─ ...
├─ output/
│  ├─ OutputService.ts       # Uses llmxml for conversions
│  └─ ...
├─ tests/
│  ├─ integration/
│  │  ├─ cli.test.ts
│  │  ├─ sdk.test.ts
│  │  └─ ...
│  ├─ unit/
│  │  └─ (unit tests for each service)
│  └─ ...
├─ cli/
│  ├─ cmd.ts                 # Command entry
│  └─ ...
├─ sdk/
│  ├─ index.ts               # runMeld, parseMeld, ...
│  └─ ...
└─ package.json

─────────────────────────────────────────────────────────────────────────
  SERVICE ARCHITECTURE DETAILS
─────────────────────────────────────────────────────────────────────────

Below is a breakdown of key services, their responsibilities, and how they interrelate.

─────────────────────────────────────────────────────────────────────────
  1. PathService
─────────────────────────────────────────────────────────────────────────
[See detailed design in service-path-fs.md]

• Responsibility:  
  - Expand special path variables ($PROJECTPATH, $HOMEPATH, etc.)  
  - Normalize path on each platform (POSIX/Win32)  
  - Provide test-mode overrides for easy mocking  

• Example Usage in a directive:  
  "PathDirectiveHandler" calls PathService.resolve("$PROJECTPATH/foo.txt")  
  -> returns /my/project/foo.txt  

─────────────────────────────────────────────────────────────────────────
  2. FileSystemService
─────────────────────────────────────────────────────────────────────────
[See detailed design in service-path-fs.md]

• Responsibility:  
  - Abstract raw file operations (read, write, exist checks)  
  - Provide uniform mocking approach for tests  
  - Handle error codes, e.g. ENOENT -> MeldError  

• Example:  
  "ImportDirectiveHandler" needs to read a .meld file from disk:  
     fileSystemService.readFile(resolvedPath)  

─────────────────────────────────────────────────────────────────────────
  3. CircularityService
─────────────────────────────────────────────────────────────────────────
[See detailed design in service-circularity.md]

• Responsibility:  
  - Keep track of which files have been imported  
  - Detect cycles (File A imports B, B imports A, etc.)  
  - Provide user-friendly error if a cycle is found  

• Example:  
  "ImportDirectiveHandler" notifies CircularityService.importStarted(filePath),  
  then if importStarted returns an error, we throw a "Circular reference" MeldError.  

─────────────────────────────────────────────────────────────────────────
  4. StateService
─────────────────────────────────────────────────────────────────────────
[See detailed design in service-state.md]

• Responsibility:  
  - Store raw variable values without processing
  - Maintain variable type information
  - Support variable deletion and updates
  - Manage state hierarchy for imports/embeds
  - Track imported files

• Example:  
  "TextDirectiveHandler" -> stateService.setTextVar(name, rawValue)  
  "DataDirectiveHandler" -> stateService.setDataVar(name, rawObject)  

─────────────────────────────────────────────────────────────────────────
  5. ResolutionService
─────────────────────────────────────────────────────────────────────────
[See detailed design in service-resolution.md]

• Core Responsibility:  
  - Resolve text variables (${var})
  - Resolve data variables and fields (#{data.field})
  - Resolve path variables ($path)
  - Resolve command references ($command(args))
  - Enforce context-specific resolution rules
  - Detect variable reference cycles

• Key Components:
  1. Dedicated Resolvers:
     - TextResolver: Handles ${var}, prevents nested interpolation
     - DataResolver: Handles #{data.field}, validates field access
     - PathResolver: Enforces $HOMEPATH/$PROJECTPATH rules
     - CommandResolver: Validates parameter types, no data vars in commands

  2. Resolution Contexts:
     - Path Context: Must start with $HOMEPATH/$PROJECTPATH
     - Command Context: Only text/path vars, no data vars
     - Text Context: All variable types, no nesting
     - Data Context: Allows field access, no commands

  3. Context Factory:
     - Pre-defined contexts per directive type
     - Enforces grammar rules
     - Prevents invalid variable usage

  4. Cycle Detection:
     - Tracks variable resolution stack
     - Detects circular references
     - Separate from file import cycles (CircularityService)

• Example Usage:
```typescript
// 1. Get appropriate context
const context = ResolutionContextFactory.forRunDirective();

// 2. Resolve with context validation
const resolved = await resolutionService.resolveInContext(
  value,
  context
);

// 3. Handle specific resolution types
const cmdResult = await resolutionService.resolveCommand(
  cmd,
  args,
  context
);
```

─────────────────────────────────────────────────────────────────────────
  6. DirectiveService
─────────────────────────────────────────────────────────────────────────
[See detailed design in service-directive.md]

• Responsibility:  
  - Route directives to appropriate handlers
  - Coordinate between ValidationService and ResolutionService
  - Store raw values via StateService
  - Manage directive dependencies via ResolutionService

• Organization:
  Definition Handlers:
  - Store raw values in StateService
  - No resolution logic
  - Validate directive structure

  Execution Handlers:
  - Use ResolutionService for all variable resolution
  - Pass appropriate resolution context
  - Handle resolution errors

• Example:  
  "@text var = value" -> TextHandler stores raw value
  "@run [$cmd(${arg})]" -> RunHandler uses ResolutionService

─────────────────────────────────────────────────────────────────────────
  7. ParserService
─────────────────────────────────────────────────────────────────────────
• Responsibility:  
  - Parse Meld content → AST (MeldNode[]) using meld-ast
  - Wrap meld-ast's parse() function
  - Provide error location details  

─────────────────────────────────────────────────────────────────────────
  8. InterpreterService
─────────────────────────────────────────────────────────────────────────
[See detailed design in service-interpreter.md]

• Responsibility:  
  - Orchestrates the main "interpretation" pipeline:  
     1) For each AST node:  
         - If Directive, route to DirectiveService  
         - If Text, store as raw text or pass along  
     2) Merge results into StateService  
  - Provide top-level interpretMeld() function  

─────────────────────────────────────────────────────────────────────────
  9. OutputService
─────────────────────────────────────────────────────────────────────────
[See detailed design in service-output.md]

• Responsibility:  
  - Convert final Meld AST/state to desired format  
    (e.g. Markdown, LLM XML, JSON, etc.)  
  - Possibly wrap code fences, transform directives to <directive> tags, etc.  

─────────────────────────────────────────────────────────────────────────
  ARCHITECTURE RELATIONS (ASCII DIAGRAM)
─────────────────────────────────────────────────────────────────────────

                     +-------------------------+  (1) Parse with meld-ast
                     |      ParserService     |   get AST nodes
                     +----------+-------------+
                                |
  (2) For each node   +---------v----------+  (2a) If directive:
                     |  InterpreterService | -----> +---------------------+
                     +---------+----------+         | DirectiveService    |
                               |                    |   Definition vs.    |
                               |                    |   Execution Handlers|
                     (2b) Node type?                +-------+------------+
                               |                            |
                    +----------v-------------+             |
                    |     StateService      | <-----------+
                    |   (Raw Value Store)   |      |
                    +------------------------+      |
                               |                   |
                               v                   v
                    +------------------------+ +-----------------+
                    | ResolutionService     | |  Validation    |
                    | • Context Factory     | |   Service      |
                    | • Type Resolvers      | +-----------------+
                    | • Cycle Detection     |
                    +------------------------+
                               |
                               v
       +------------------------------------------------+
       | OutputService (uses llmxml for conversion)     |
       +------------------------------------------------+

─────────────────────────────────────────────────────────────────────────
  ILLUSTRATION OF A DIRECTIVE'S FLOW (example: @text)
─────────────────────────────────────────────────────────────────────────

   1) ParserService sees line "@text greeting = 'Hello, world!'"
      -> Creates a DirectiveNode { kind: 'text', ... }

   2) InterpreterService processes that node:
      -> directiveService.handleDirective(node, interpreterContext)

   3) directiveService finds "TextDirectiveHandler" in internal registry
      -> textHandler.execute(node, stateService, { interpolationService, validationService, ... })

   4) TextDirectiveHandler:
      A) validationService.validateTextDirective(...)
      B) interpolationService.resolveAll(directive.value)  // if needed
      C) stateService.setTextVar(name, finalValue)

   5) Interpretation continues with next node

─────────────────────────────────────────────────────────────────────────
  EXAMPLE: HANDLER SCAFFOLD
─────────────────────────────────────────────────────────────────────────

export class TextDirectiveHandler {
  constructor(
    private validationService: ValidationService,
    private interpolationService: InterpolationService,
    private stateService: StateService
  ) {}

  public execute(node: DirectiveNode): void {
    // 1) Validate
    this.validationService.validateTextDirective(node);

    // 2) Extract name/value
    const { name, value } = node.directive;

    // 3) Possibly do interpolation
    const resolvedValue = this.interpolationService.resolveAll(value);

    // 4) Store in state
    this.stateService.setTextVar(name, resolvedValue);
  }
}

─────────────────────────────────────────────────────────────────────────
  ADVANTAGES OF THIS DESIGN
─────────────────────────────────────────────────────────────────────────

• Each directive's logic is short & clean—just orchestrating the relevant services.  
• Path expansions, filesystem I/O, and state merges are decoupled from directives.  
• Clear single responsibility: each service does exactly "one thing."  
• Tests become simpler: each service is tested with mocks of its dependencies.  
• Better layering: the final pipeline is easy to see in InterpreterService.  

─────────────────────────────────────────────────────────────────────────
  EXAMPLE SERVICE TYPE USAGE
─────────────────────────────────────────────────────────────────────────

1. ParserService:
```typescript
import { parse } from 'meld-ast';
import { MeldNode, Parser } from 'meld-spec';

export class ParserService implements Parser {
  parse(content: string): MeldNode[] {
    return parse(content);
  }
}
```

2. StateService:
```typescript
import { TextVariable, DataVariable, PathVariable, CommandDefinition } from 'meld-spec';

export class StateService {
  private textVars = new Map<string, TextVariable>();
  private dataVars = new Map<string, DataVariable>();
  private pathVars = new Map<string, PathVariable>();
  private commands = new Map<string, CommandDefinition>();
}
```

3. ValidationService:
```typescript
import { 
  DirectiveNode, 
  ValidationError,
  ValidationContext,
  ValidationResult 
} from 'meld-spec';

export class ValidationService {
  validate(node: DirectiveNode): ValidationResult {
    // Validation logic using meld-spec types
  }
}
```

4. OutputService:
```typescript
import { createLLMXML } from 'llmxml';

export class OutputService {
  private llmxml = createLLMXML({
    defaultFuzzyThreshold: 0.8,
    warningLevel: 'ambiguous-only'
  });

  constructor() {
    // Register warning handler for ambiguous matches
    this.llmxml.on('warning', this.handleWarning);
  }

  async convertToXML(markdown: string): Promise<string> {
    return this.llmxml.toXML(markdown);
  }

  async extractSection(content: string, sectionName: string) {
    try {
      return await this.llmxml.getSection(content, sectionName, {
        includeNested: true,
        fuzzyThreshold: 0.8
      });
    } catch (error) {
      if (error.code === 'SECTION_NOT_FOUND') {
        throw new Error(`Section "${sectionName}" not found`);
      }
      throw error;
    }
  }

  private handleWarning(warning: any) {
    if (warning.code === 'AMBIGUOUS_MATCH') {
      console.warn('Multiple potential matches found:', 
        warning.details.matches.map((m: any) => m.title).join(', ')
      );
    }
  }
}
```

─────────────────────────────────────────────────────────────────────────
  SUB-TASKS TO FLESH OUT THIS DESIGN
─────────────────────────────────────────────────────────────────────────

1. Set Up Core Library Integration
   - Add meld-spec as single source for ALL types
   - Add meld-ast ONLY for parsing functionality
   - Add llmxml for XML conversion
   - Configure TypeScript for proper imports

2. Create Service Interfaces
   - Define method signatures using meld-spec types
   - Example:
       interface IPathService {
         resolve(specialPath: string): Promise<string>;
         // ...
       }

3. Build Error System
   - Create error hierarchy extending meld-spec
   - Centralize error creation
   - Add location tracking

4. Implement ParserService
   - Create thin wrapper around meld-ast
   - Add error translation
   - Add validation hooks

5. Create Core Services
   - PathService with meld-spec types
   - FileSystemService for I/O
   - ValidationService using meld-spec
   - StateService with proper types

6. Build Directive System
   - Create handler registry
   - Implement each directive
   - Use services for complex operations

7. Add Integration Tests
   - Test full pipeline
   - Verify library integration
   - Check error handling

─────────────────────────────────────────────────────────────────────────
  CONCLUSION & NEXT STEPS
─────────────────────────────────────────────────────────────────────────

With this services-based design:

1. We leverage core Meld libraries:
   • meld-ast for parsing
   • llmxml for XML conversion
   • meld-spec for types

2. Each service has clear responsibilities:
   • Minimal, focused interfaces
   • Clean dependency injection
   • Easy to test and maintain

3. Directives remain simple:
   • Use services for complex operations
   • Focus on business logic
   • Easy to add new ones

4. Testing is straightforward:
   • Unit test each service
   • Integration test the pipeline
   • Mock complex operations

This architecture yields a maintainable codebase that integrates seamlessly with the Meld ecosystem while following SOLID principles.
