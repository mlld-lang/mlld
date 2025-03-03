# Debug Tools Integration Completion

## Issue Summary
The Meld codebase has a partially implemented debugging system that needs to be completed to enable effective debugging of variable resolution and state management issues. The debug tools are well-designed and partially implemented in the TestContext, but they're not properly integrated with the CLI commands and the ResolutionService.

## Current Status

### What Works
- The TestContext has working debug tools through the TestDebuggerService
- Debug session methods like `startDebugSession`, `endDebugSession`, and `visualizeState` work in tests
- The VariableResolutionTracker class is implemented and can track variable resolution attempts
- The VariableReferenceResolver has methods to set and use the tracker

### What's Missing
1. The ResolutionService doesn't have the `enableResolutionTracking` and `getResolutionTracker` methods that the CLI commands expect
2. Module resolution issues prevent the CLI commands from accessing the debug tools
3. There's no "debug" script in package.json for easy access to debug tools
4. The CLI commands try to use ts-node directly, which doesn't work with the module resolution setup

### Discoveries from Debugging
1. **Service Registration Issues**: The `ResolutionService` is marked with `@singleton()` but not explicitly registered in the DI container. While `@singleton()` implicitly applies `@injectable()`, the service may not be properly registered for CLI commands to resolve it.

2. **Syntax Evolution**: Test files using incorrect syntax directives are incompatible with the current parser. According to the Meld Grammar Specification, variable declarations should use `@text`, `@data`, or `@path` directives depending on the variable type, not `@set` or `@var`. 

3. **Direct Service Instantiation**: Directly instantiating services outside the DI container proved effective for debugging. This approach could be incorporated as an alternative debugging method when the DI container has issues.

4. **Runtime Patching**: Patching service prototypes at runtime to add logging was effective for diagnosing method calls without modifying source code. This technique could be formalized as a debug utility.

5. **Parser Error Reporting**: Parser errors are not always clearly reported, making it difficult to identify syntax issues. Improving error reporting in the debug tools would help identify syntax issues more quickly.

6. **Import Resolution Tracking**: Issues with how imported files are processed highlight the need for the debug tools to specifically track variable resolution across file boundaries.

## Detailed Requirements

### 1. Add Missing Methods to ResolutionService

The ResolutionService needs two new methods:

```typescript
// Add to ResolutionService class
private resolutionTracker?: VariableResolutionTracker;

/**
 * Enable tracking of variable resolution attempts
 * @param config Configuration for the resolution tracker
 */
enableResolutionTracking(config: Partial<ResolutionTrackingConfig>): void {
  // Import and create the tracker if it doesn't exist
  if (!this.resolutionTracker) {
    this.resolutionTracker = new VariableResolutionTracker();
  }
  
  // Configure the tracker
  this.resolutionTracker.configure({
    enabled: true,
    ...config
  });
  
  // Set it on the variable reference resolver
  this.variableReferenceResolver.setResolutionTracker(this.resolutionTracker);
}

/**
 * Get the resolution tracker for debugging
 * @returns The current resolution tracker or undefined if not enabled
 */
getResolutionTracker(): VariableResolutionTracker | undefined {
  return this.resolutionTracker;
}
```

### 2. Fix Module Resolution Issues

The CLI commands are trying to import modules from paths that don't match the actual module structure. There are two approaches to fix this:

#### Option A: Update Import Paths in CLI Commands
Update the import paths in the CLI commands to match the actual module structure:

```typescript
// In cli/commands/debug-resolution.ts
import { VariableResolutionTracker, ResolutionTrackingConfig } from '../../tests/utils/debug/VariableResolutionTracker/VariableResolutionTracker.js';
```

#### Option B: Export Debug Tools from a Central Location
Create a new module that re-exports all debug tools:

```typescript
// Create a new file: src/debug/index.ts
export { VariableResolutionTracker, ResolutionTrackingConfig } from '../tests/utils/debug/VariableResolutionTracker/VariableResolutionTracker.js';
export { StateDebuggerService } from '../tests/utils/debug/StateDebuggerService/StateDebuggerService.js';
// ... other exports

// Then in CLI commands:
import { VariableResolutionTracker, ResolutionTrackingConfig } from '@debug/index.js';
```

### 3. Add Debug Script to package.json

Add a "debug" script to package.json for easier access to debug tools:

```json
"scripts": {
  // ... existing scripts
  "debug": "node dist/cli/index.js debug-resolution",
  "debug:resolution": "node dist/cli/index.js debug-resolution",
  "debug:context": "node dist/cli/index.js debug-context",
  "debug:transform": "node dist/cli/index.js debug-transform"
}
```

### 4. Ensure CLI Commands Use Built Code

The CLI commands should use the built code rather than trying to run with ts-node directly. This requires:

1. Building the codebase before running debug commands:
```bash
npm run build
npm run debug:resolution -- path/to/file.meld --var variableName
```

2. Updating the CLI commands to handle module resolution correctly:
```typescript
// In cli/commands/debug-resolution.ts
try {
  // Get required services
  const resolutionService = container.resolve<IResolutionService>('ResolutionService');
  // ... other services

  // Enable resolution tracking
  if (typeof (resolutionService as any).enableResolutionTracking === 'function') {
    (resolutionService as any).enableResolutionTracking({
      watchVariables: variableName ? [variableName] : undefined
    });
  } else {
    console.error(chalk.red('Resolution tracking is not available - enableResolutionTracking method missing'));
    return;
  }
  
  // ... rest of the code
} catch (error) {
  console.error(chalk.red(`Error initializing debug tools: ${error.message}`));
  console.error(chalk.yellow('Make sure you have built the codebase with "npm run build" before running debug commands'));
  return;
}
```

## Step-by-Step Implementation Guide

For a developer new to the codebase, here's a detailed guide to implement the necessary changes:

### Step 1: Locate and Update the ResolutionService

1. Find the ResolutionService class:
   ```bash
   find src -name "ResolutionService.ts"
   ```

2. Open the file and add the following imports at the top:
   ```typescript
   import { VariableResolutionTracker, ResolutionTrackingConfig } from '../../tests/utils/debug/VariableResolutionTracker/VariableResolutionTracker';
   ```

3. Add the following properties and methods to the ResolutionService class:
   ```typescript
   private resolutionTracker?: VariableResolutionTracker;

   /**
    * Enable tracking of variable resolution attempts
    * @param config Configuration for the resolution tracker
    */
   enableResolutionTracking(config: Partial<ResolutionTrackingConfig> = {}): void {
     // Import and create the tracker if it doesn't exist
     if (!this.resolutionTracker) {
       this.resolutionTracker = new VariableResolutionTracker();
     }
     
     // Configure the tracker
     this.resolutionTracker.configure({
       enabled: true,
       ...config
     });
     
     // Set it on the variable reference resolver
     this.variableReferenceResolver.setResolutionTracker(this.resolutionTracker);
   }

   /**
    * Get the resolution tracker for debugging
    * @returns The current resolution tracker or undefined if not enabled
    */
   getResolutionTracker(): VariableResolutionTracker | undefined {
     return this.resolutionTracker;
   }
   ```

4. If there's an IResolutionService interface, update it to include these methods:
   ```typescript
   enableResolutionTracking(config?: Partial<ResolutionTrackingConfig>): void;
   getResolutionTracker(): VariableResolutionTracker | undefined;
   ```

### Step 2: Fix Module Resolution in CLI Commands

1. Find the debug CLI commands:
   ```bash
   find src/cli -name "debug-*.ts"
   ```

2. For each debug command file, update the imports to use the correct paths:
   ```typescript
   // Replace any imports like:
   import { VariableResolutionTracker } from '@debug/VariableResolutionTracker';
   
   // With:
   import { VariableResolutionTracker } from '../../tests/utils/debug/VariableResolutionTracker/VariableResolutionTracker';
   ```

3. Alternatively, create a central debug export file:
   ```bash
   mkdir -p src/debug
   touch src/debug/index.ts
   ```

4. Add the following to src/debug/index.ts:
   ```typescript
   export { VariableResolutionTracker, ResolutionTrackingConfig } from '../tests/utils/debug/VariableResolutionTracker/VariableResolutionTracker';
   export { StateDebuggerService } from '../tests/utils/debug/StateDebuggerService/StateDebuggerService';
   // Add other debug tool exports as needed
   ```

5. Update the CLI commands to import from this central location:
   ```typescript
   import { VariableResolutionTracker } from '../../debug';
   ```

### Step 3: Add Debug Scripts to package.json

1. Open package.json and add the following scripts:
   ```json
   "scripts": {
     // ... existing scripts
     "debug": "node dist/cli/index.js debug-resolution",
     "debug:resolution": "node dist/cli/index.js debug-resolution",
     "debug:context": "node dist/cli/index.js debug-context",
     "debug:transform": "node dist/cli/index.js debug-transform"
   }
   ```

### Step 4: Ensure Proper Service Registration

1. Check if ResolutionService is properly registered in the DI container:
   ```bash
   grep -r "ResolutionService" src/core/di-config.ts
   ```

2. If not found, add explicit registration in src/core/di-config.ts:
   ```typescript
   container.register('ResolutionService', {useClass: ResolutionService});
   ```

### Step 5: Update Error Handling in CLI Commands

1. For each debug command, add robust error handling:
   ```typescript
   try {
     // Get required services
     const resolutionService = container.resolve<IResolutionService>('ResolutionService');
     
     // Check if the required methods exist
     if (typeof resolutionService.enableResolutionTracking !== 'function') {
       console.error(chalk.red('Resolution tracking is not available - enableResolutionTracking method missing'));
       console.error(chalk.yellow('Make sure you have built the codebase with the latest changes'));
       return;
     }
     
     // Enable resolution tracking
     resolutionService.enableResolutionTracking({
       watchVariables: variableName ? [variableName] : undefined
     });
     
     // ... rest of the code
   } catch (error) {
     console.error(chalk.red(`Error initializing debug tools: ${error.message}`));
     console.error(chalk.yellow('Make sure you have built the codebase with "npm run build" before running debug commands'));
     return;
   }
   ```

### Step 6: Build and Test

1. Build the codebase:
   ```bash
   npm run build
   ```

2. Test the debug commands:
   ```bash
   npm run debug:resolution -- test-files/debug-test.meld --var testVar
   ```

## Temporary Debug Scripts

During the development and debugging process, several temporary scripts were created to help diagnose issues. These scripts should be **deleted** once the proper debug tools are working correctly.

### 1. debug-direct.js

**Purpose**: Directly instantiates services outside the DI container to bypass dependency injection issues.

**Location**: Root directory

**Usage**:
```bash
node debug-direct.js test-files/debug-test.meld
```

**Code**:
```javascript
// debug-direct.js
require('reflect-metadata');
const { ResolutionService } = require('./dist/services/resolution/ResolutionService/ResolutionService');
const { FileSystemService } = require('./dist/services/FileSystemService/FileSystemService');
const { ParserService } = require('./dist/services/ParserService/ParserService');
const { StateService } = require('./dist/services/StateService/StateService');
const fs = require('fs');
const path = require('path');

// Create services directly
const stateService = new StateService();
const fileSystemService = new FileSystemService();
const parserService = new ParserService();
const resolutionService = new ResolutionService(stateService, fileSystemService);

// Initialize state
stateService.setProjectPath(process.cwd());
stateService.setHomePath(process.env.HOME || process.env.USERPROFILE);

// Enable resolution tracking
resolutionService.enableResolutionTracking({
  enabled: true,
  watchVariables: ['testVar']
});

// Process a file
async function debugFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const parsedContent = await parserService.parseContent(content, filePath);
  
  // Process the file
  console.log('Parsed content:', JSON.stringify(parsedContent, null, 2));
  
  // Get resolution tracking results
  const tracker = resolutionService.getResolutionTracker();
  if (tracker) {
    const attempts = tracker.getResolutionAttempts();
    console.log('Resolution attempts:', attempts);
  }
}

// Run the debug
debugFile(process.argv[2] || 'test-files/debug-test.meld');
```

### 2. debug-syntax.js

**Purpose**: Validates Meld file syntax and reports errors in a more user-friendly way.

**Location**: Root directory

**Usage**:
```bash
node debug-syntax.js test-files/debug-test.meld
```

**Code**:
```javascript
// debug-syntax.js
require('reflect-metadata');
const { ParserService } = require('./dist/services/ParserService/ParserService');
const fs = require('fs');

const parserService = new ParserService();

async function validateSyntax(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  try {
    const parsedContent = await parserService.parseContent(content, filePath);
    console.log('Syntax is valid!');
    console.log('Parsed directives:', parsedContent.directives.map(d => `@${d.type} ${d.name || ''}`));
  } catch (error) {
    console.error('Syntax error:', error.message);
    
    // Show the line with the error
    const lines = content.split('\n');
    if (error.line) {
      console.error(`Line ${error.line}: ${lines[error.line - 1]}`);
      console.error(' '.repeat(error.column || 0) + '^');
      console.error('Expected directive format: @text varName = "value"');
    }
  }
}

validateSyntax(process.argv[2] || 'test-files/debug-test.meld');
```

### 3. debug-import.js

**Purpose**: Specifically tests the import directive handling and variable propagation.

**Location**: Root directory

**Usage**:
```bash
node debug-import.js test-files/debug-test.meld
```

**Code**:
```javascript
// debug-import.js
require('reflect-metadata');
const { ResolutionService } = require('./dist/services/resolution/ResolutionService/ResolutionService');
const { FileSystemService } = require('./dist/services/FileSystemService/FileSystemService');
const { ParserService } = require('./dist/services/ParserService/ParserService');
const { StateService } = require('./dist/services/StateService/StateService');
const { ImportDirectiveHandler } = require('./dist/services/DirectiveHandlers/ImportDirectiveHandler/ImportDirectiveHandler');
const fs = require('fs');
const path = require('path');

// Create services directly
const stateService = new StateService();
const fileSystemService = new FileSystemService();
const parserService = new ParserService();
const resolutionService = new ResolutionService(stateService, fileSystemService);
const importHandler = new ImportDirectiveHandler(fileSystemService, parserService, resolutionService);

// Initialize state
stateService.setProjectPath(process.cwd());
stateService.setHomePath(process.env.HOME || process.env.USERPROFILE);

// Enable resolution tracking
resolutionService.enableResolutionTracking({
  enabled: true,
  watchVariables: ['testVar', 'importVar', 'combinedVar']
});

// Process a file with imports
async function debugImport(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const parsedContent = await parserService.parseContent(content, filePath);
  
  // Find import directives
  const importDirectives = parsedContent.directives.filter(d => d.type === 'import');
  console.log(`Found ${importDirectives.length} import directives`);
  
  // Process each import
  for (const directive of importDirectives) {
    console.log(`Processing import: ${directive.path}`);
    await importHandler.handle(directive, { state: stateService.getState() });
  }
  
  // Show state after imports
  console.log('State after imports:', stateService.getState());
  
  // Get resolution tracking results
  const tracker = resolutionService.getResolutionTracker();
  if (tracker) {
    const attempts = tracker.getResolutionAttempts();
    console.log('Resolution attempts:', attempts);
  }
}

// Run the debug
debugImport(process.argv[2] || 'test-files/debug-test.meld');
```

**Note**: These temporary scripts should be deleted once the proper debug tools are working correctly. They were created solely for diagnostic purposes during the development process.

## Exit Criteria for Successful Implementation

The debug tools implementation will be considered successful when the following criteria are met:

### 1. Functional Requirements

- [ ] ResolutionService has working `enableResolutionTracking` and `getResolutionTracker` methods
- [ ] CLI commands can access and use the debug tools without module resolution errors
- [ ] Debug scripts in package.json work correctly with the built code
- [ ] Variable resolution tracking works across file boundaries (especially with imports)
- [ ] Debug tools provide clear and useful information about variable resolution attempts

### 2. Usability Requirements

- [ ] Running `npm run debug:resolution -- path/to/file.meld --var variableName` shows detailed information about how the variable is resolved
- [ ] Error messages are clear and helpful when syntax issues are encountered
- [ ] Debug tools provide suggestions for fixing common issues (e.g., incorrect directive syntax)
- [ ] Documentation is updated to reflect the current state of the debug tools

### 3. Testing Requirements

- [ ] Debug tools work correctly with the test files in the `test-files` directory
- [ ] Debug tools can be used in automated tests through the TestContext
- [ ] Debug tools correctly handle edge cases like circular imports and missing variables

### 4. Verification Tests

To verify the implementation is successful, the following tests should pass:

1. **Basic Variable Resolution Test**:
   ```bash
   npm run debug:resolution -- test-files/debug-test.meld --var testVar
   ```
   Expected output: Shows that `testVar` is resolved to "Hello, world!"

2. **Nested Variable Resolution Test**:
   ```bash
   npm run debug:resolution -- test-files/debug-test.meld --var nestedVar
   ```
   Expected output: Shows that `nestedVar` is resolved by first resolving `testVar`

3. **Import Variable Resolution Test**:
   ```bash
   npm run debug:resolution -- test-files/debug-test.meld --var importVar
   ```
   Expected output: Shows that `importVar` is resolved from the imported file

4. **Combined Variable Resolution Test**:
   ```bash
   npm run debug:resolution -- test-files/debug-test.meld --var combinedVar
   ```
   Expected output: Shows that `combinedVar` is resolved by combining `testVar` and `importVar`

When all these criteria are met, the debug tools implementation can be considered complete and successful.

## Notes on Module Resolution

The module resolution issues are likely due to the way TypeScript and Node.js handle module resolution differently. When using ts-node, it tries to resolve modules using TypeScript's module resolution, which may not match the actual runtime module resolution.

Building the codebase first ensures that all modules are properly compiled and available at the correct paths for Node.js to resolve them at runtime.

## Impact

Completing the debug tools integration will significantly enhance our ability to diagnose and fix issues like the variable propagation problem in the ImportDirectiveHandler. It will provide visibility into how variables are resolved across state boundaries and help identify exactly where variables are being lost during the import process. 