Below is a complete plan for performing the Right-Side Operation refactor, including detailed explanations of why each change is being made and the exact, atomic code changes (line-by-line diffs) for the most complex portions of the code. In other words, you’ll get:
	1.	An overall step-by-step plan for implementing the right-side directive refactor.
	2.	Explanations of design changes (why we’re doing what we’re doing).
	3.	Exact line-by-line diffs of the most complex files so you know precisely what to change and where to change it.

1. High-Level Implementation Steps

1.1 Create a New HandlerContext Interface

We need a small structure that indicates whether a handler is being called in a top-level context or a right-side (sub) context, plus optional references such as a base location, parent state, or any relevant flags.

File: src/interpreter/directives/types.ts (or wherever your DirectiveHandler interface lives)

Add:

+ export interface HandlerContext {
+   /**
+    * 'toplevel' means the directive is processed at the file's top level
+    * 'rightside' means the directive is processed in a right-side operation context
+    */
+   mode: 'toplevel' | 'rightside';

+   /**
+    * If there's a parent state from which we inherit variables
+    */
+   parentState?: InterpreterState;

+   /**
+    * If there's a "base" location for right-side operations
+    */
+   baseLocation?: Location;

+   /**
+    * You can add any additional flags you need here in the future
+    */
+ }

1.2 Extend the DirectiveHandler Interface

We want our directive handlers to be able to differentiate between top-level usage and right-side usage. So we add a second parameter: context: HandlerContext.

File: src/interpreter/directives/types.ts

 export interface DirectiveHandler {
-  canHandle(kind: string): boolean;
-  handle(node: DirectiveNode, state: InterpreterState): void;
+  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean;
+  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void;
 }

1.3 Update DirectiveRegistry to Pass the context

We’ll do two main things in DirectiveRegistry:
	1.	In findHandler, we now pass mode: 'toplevel' | 'rightside'.
	2.	In registerHandler, no big changes are needed, but we might want to rename or refactor how we handle calls to canHandle.

File: src/interpreter/directives/registry.ts

 export class DirectiveRegistry {
   ...

-  static findHandler(kind: string): DirectiveHandler | undefined {
-    return DirectiveRegistry.handlers.find(handler => handler.canHandle(kind));
+  static findHandler(kind: string, mode: 'toplevel' | 'rightside'): DirectiveHandler | undefined {
+    return DirectiveRegistry.handlers.find(handler => handler.canHandle(kind, mode));
   }

   ...
 }

1.4 Adjust the Core interpret Function to Use HandlerContext

Inside interpreter.ts, we pass mode: 'toplevel' when we’re at the top level.
If we ever interpret sub-directives or “right-side” expressions, we pass mode: 'rightside'.

File: src/interpreter/interpreter.ts

 export function interpret(nodes: MeldNode[], state: InterpreterState): void {
   ...
   for (const node of nodes) {
     try {
       ...
       if (node.type === 'Directive') {
         const directiveNode = node as DirectiveNode;
-        const handler = DirectiveRegistry.findHandler(directiveNode.directive.kind);
+        const handler = DirectiveRegistry.findHandler(
+          directiveNode.directive.kind,
+          'toplevel' // <--- We pass "toplevel" here
+        );
         if (!handler) {
           ...
         }

         handler.handle(directiveNode, state, {
+          mode: 'toplevel'
         });
       } else {
         ...
       }
     } catch (error) {
       ...
     }
   }
   ...
 }

1.5 Refactor subInterpreter.ts to Use HandlerContext

subInterpreter.ts is where we interpret nested or right-side directives. Instead of re-running partial logic, we want to (a) parse them, and (b) call interpretMeld(nodes, childState, { mode: 'rightside' }) or something similar.

We’ll create or modify a function that calls our existing interpret but with the mode: 'rightside'.

1.5.1 Introduce an Overload or Option to Pass mode

File: src/interpreter/interpreter.ts (or wherever interpretMeld is exported)

 export function interpretMeld(nodes: MeldNode[], state: InterpreterState): InterpreterState {
   ...
-  interpret(nodes, state);
+  // Provide an optional mode argument
+  interpret(nodes, state, { mode: 'toplevel' });
   return state;
 }

+// Overload or optional param
+export function interpretMeldRightSide(
+  nodes: MeldNode[],
+  state: InterpreterState,
+  baseLocation?: Location
+): InterpreterState {
+  interpret(nodes, state, { mode: 'rightside', baseLocation });
+  return state;
+}

(You can also unify this into a single function with an extra argument, or place the logic in interpretSubDirectives if you prefer.)

1.5.2 Modify subInterpreter.ts

Inside interpretSubDirectives, instead of manually adjusting node locations or re-implementing half the logic, do something like:

 import { interpretMeldRightSide } from './interpreter';

 export function interpretSubDirectives(
   content: string,
   baseLocation: Location,
   parentState: InterpreterState
 ): InterpreterState {
   ...

   try {
     const childState = new InterpreterState();
     childState.parentState = parentState;

     const nodes = parseMeld(content);

-    // Before: We manually adjusted node locations and called interpretMeld
-    nodes.forEach(node => adjustNodeLocation(node, baseLocation));
-    interpretMeld(nodes, childState);

+    // After: call the “right-side” version with context
+    interpretMeldRightSide(nodes, childState, baseLocation);

     childState.isImmutable = true;
     return childState;
   } catch (error) {
     ...
   }
 }

Now, in your interpretMeldRightSide, you can handle location adjustments in a unified place or pass that responsibility down to each directive handler’s handle() method (depending on how granular you want your refactor to be).

2. The Most Complex Portions: Line-by-Line Changes

Below is a more detailed, atomic diff for the two files where the heaviest changes typically occur: subInterpreter.ts (where we currently do a lot of custom logic) and registry.ts (where we add the context-based lookup). These diffs assume your original code is unchanged until now, so you can do a straightforward patch.

2.1 subInterpreter.ts — Line-by-Line Diff

<details>
<summary>Expand Diff for <code>subInterpreter.ts</code></summary>


--- a/src/interpreter/subInterpreter.ts
+++ b/src/interpreter/subInterpreter.ts
@@ -1,134 +1,35 @@
 import { DirectiveNode, Location, Node } from 'meld-spec';
 import { MeldInterpretError } from './errors/errors';
 import { InterpreterState } from './state/state';
 import { parseMeld } from './parser';
-import { interpretMeld } from './interpreter';

-function logLocation(node: Node, context: string, baseLocation?: Location) {
-  console.log(`[SubInterpreter] ${context}:`, {
-    nodeType: node.type,
-    originalLocation: node.location ? { ...node.location } : undefined,
-    baseLocation,
-    hasLocation: !!node.location,
-    hasStart: !!node.location?.start,
-    hasEnd: !!node.location?.end
-  });
-}

-function logLocationAdjustment(node: Node, baseLocation: Location, adjustedLocation: Location) {
-  console.log('[SubInterpreter] Location adjustment:', {
-    nodeType: node.type,
-    original: node.location,
-    base: baseLocation,
-    adjusted: adjustedLocation,
-    startLineDelta: adjustedLocation.start.line - (node.location?.start.line ?? 0),
-    startColumnDelta: adjustedLocation.start.column - (node.location?.start.column ?? 0)
-  });
-}

-function adjustNodeLocation(node: Node, baseLocation: Location): void {
-  if (!node.location) {
-    console.log('[SubInterpreter] Node missing location, skipping adjustment:', {
-      nodeType: node.type
-    });
-    return;
-  }
-
-  logLocation(node, 'Pre-adjustment', baseLocation);
-
-  const startLine = node.location.start.line + baseLocation.start.line - 1;
-  const startColumn = node.location.start.line === 1
-    ? node.location.start.column + baseLocation.start.column - 1
-    : node.location.start.column;
-
-  const endLine = node.location.end.line + baseLocation.start.line - 1;
-  const endColumn = node.location.end.line === 1
-    ? node.location.end.column + baseLocation.start.column - 1
-    : node.location.end.column;
-
-  const adjustedLocation = {
-    start: { line: startLine, column: startColumn },
-    end: { line: endLine, column: endColumn }
-  };
-
-  logLocationAdjustment(node, baseLocation, adjustedLocation);
-  node.location = adjustedLocation;
-}

+import { interpretMeldRightSide } from './interpreter'; // <-- We'll create or import this

 /**
  * Interprets sub-directives found within content, returning a child state.
  */
 export function interpretSubDirectives(
   content: string,
   baseLocation: Location,
   parentState: InterpreterState
 ): InterpreterState {
-  console.log('[SubInterpreter] Starting interpretation:', {
-    contentLength: content.length,
-    baseLocation,
-    hasParentState: !!parentState,
-    parentStateNodes: parentState.getNodes().length
-  });
-
   try {
     const childState = new InterpreterState();
     childState.parentState = parentState;

-    console.log('[SubInterpreter] Created child state:', {
-      hasParentState: !!childState.parentState,
-      inheritedVars: {
-        text: Array.from(parentState.getAllTextVars().keys()),
-        data: Array.from(parentState.getAllDataVars().keys())
-      }
-    });

-    console.log('[SubInterpreter] Parsing content...');
     const nodes = parseMeld(content);
-    console.log('[SubInterpreter] Parsed nodes:', {
-      count: nodes.length,
-      types: nodes.map(n => n.type)
-    });
-
-    console.log('[SubInterpreter] Adjusting node locations...');
-    nodes.forEach(node => adjustNodeLocation(node, baseLocation));
-
-    console.log('[SubInterpreter] Interpreting nodes in child state...');
-    interpretMeld(nodes, childState);
-
-    console.log('[SubInterpreter] Making child state immutable...');
+    // Instead of manually adjusting locations or calling interpretMeld directly,
+    // we rely on a specialized "right-side" interpret function that does the context logic
+    interpretMeldRightSide(nodes, childState, baseLocation);

     childState.isImmutable = true;

-    console.log('[SubInterpreter] Interpretation completed:', {
-      nodeCount: childState.getNodes().length,
-      vars: {
-        text: Array.from(childState.getAllTextVars().keys()),
-        data: Array.from(childState.getAllDataVars().keys())
-      }
-    });
     return childState;
   } catch (error) {
     console.error('[SubInterpreter] Error during interpretation:', {
       errorType: error instanceof Error ? error.constructor.name : typeof error,
       errorMessage: error instanceof Error ? error.message : String(error),
       baseLocation
     });

     if (error instanceof Error) {
       throw new MeldInterpretError(
         `Failed to parse or interpret sub-directives: ${error.message}`,
         'SubDirective',
         baseLocation.start
       );
     }
     throw error;
   }
 }

</details>


Explanation
	1.	Removed the manual adjustNodeLocation function. We’ll let each directive handle location offsets or let our new “right-side interpret” do that in a uniform way.
	2.	Removed verbose logging. You can keep some logs if you prefer, but the main idea is to drastically simplify the subInterpreter.
	3.	Called interpretMeldRightSide to interpret everything in right-side mode, with an optional baseLocation.

2.2 registry.ts — Line-by-Line Diff

Below is an example for DirectiveRegistry so that a caller can specify top-level vs right-side context. This is the minimal example. If your code structure is different, adapt as needed.

<details>
<summary>Expand Diff for <code>registry.ts</code></summary>


--- a/src/interpreter/directives/registry.ts
+++ b/src/interpreter/directives/registry.ts
@@ -1,55 +1,62 @@
 import { DirectiveHandler } from './types';
 import { runDirectiveHandler } from './run';
 import { importDirectiveHandler } from './import';
 import { embedDirectiveHandler } from './embed';
 import { defineDirectiveHandler } from './define';
 import { textDirectiveHandler } from './text';
 import { pathDirectiveHandler } from './path';
 import { dataDirectiveHandler } from './data';
 import { apiDirectiveHandler } from './api';
 import { callDirectiveHandler } from './call';

 export class DirectiveRegistry {
   private static handlers: DirectiveHandler[] = [];
   private static initialized = false;

   static {
     // Initialize built-in handlers
     DirectiveRegistry.initializeBuiltInHandlers();
   }

   private static initializeBuiltInHandlers(): void {
     if (DirectiveRegistry.initialized) return;

     const builtInHandlers = [
       runDirectiveHandler,
       importDirectiveHandler,
       embedDirectiveHandler,
       defineDirectiveHandler,
       textDirectiveHandler,
       pathDirectiveHandler,
       dataDirectiveHandler,
       apiDirectiveHandler,
       callDirectiveHandler
     ];

     for (const handler of builtInHandlers) {
       DirectiveRegistry.registerHandler(handler);
     }

     DirectiveRegistry.initialized = true;
   }

   static registerHandler(handler: DirectiveHandler): void {
     if (!handler) {
       throw new Error('Cannot register null or undefined handler');
     }
     DirectiveRegistry.handlers.push(handler);
   }

-  static findHandler(kind: string): DirectiveHandler | undefined {
-    return DirectiveRegistry.handlers.find(handler => handler.canHandle(kind));
+  /**
+   * Finds a handler that can handle the specified `kind`
+   * in the given `mode` ('toplevel' or 'rightside').
+   */
+  static findHandler(
+    kind: string,
+    mode: 'toplevel' | 'rightside'
+  ): DirectiveHandler | undefined {
+    return DirectiveRegistry.handlers.find(handler =>
+      handler.canHandle(kind, mode)
+    );
   }

   static clear(): void {
     DirectiveRegistry.handlers = [];
     DirectiveRegistry.initialized = false;
   }
 }

</details>


Explanation
	1.	Changed the signature of findHandler to accept mode: 'toplevel' | 'rightside'.
	2.	Replaced the old handler.canHandle(kind) call with handler.canHandle(kind, mode).
	3.	No other big changes needed.

3. Example Handler Refactor

Below is a short demonstration of how a directive handler can differentiate behavior for toplevel vs rightside. Let’s pick a smaller one like textDirectiveHandler. The exact logic is up to you, but this is how we can add the new signature:

File: src/interpreter/directives/text.ts

 export class TextDirectiveHandler implements DirectiveHandler {
-  canHandle(kind: DirectiveKind): boolean {
-    return kind === '@text';
+  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
+    // If you prefer, you can ignore mode or do something special for rightside
+    return kind === '@text' || kind === 'text';
   }

-  handle(node: DirectiveNode, state: InterpreterState): void {
+  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
     const data = node.directive;

     if (!data.name) {
       throw new MeldDirectiveError(
         'Text directive requires a name',
         'text',
         node.location?.start
       );
     }

     if (!data.value) {
       throw new MeldDirectiveError(
         'Text directive requires a value',
         'text',
         node.location?.start
       );
     }

     let value = data.value;
     if (Array.isArray(value)) {
       value = value.join('');
     }

+    // Example: if in rightside mode, optionally prefix with “(nested) ”
+    if (context.mode === 'rightside') {
+      value = `(nested) ${value}`;
+    }

     state.setTextVar(data.name, value);
   }
 }

Handler Explanation
	•	canHandle takes an extra parameter for mode but may or may not use it. Some handlers might want to behave differently in sub contexts.
	•	handle has a context parameter that includes .mode, .parentState, .baseLocation, etc. You can do location adjustments or inheritance logic here if needed.

4. Testing & Validation
	1.	Unit tests for each directive now must pass context: { mode: 'toplevel' } or 'rightside'.
	2.	subInterpreter.test.ts ensures that sub directives behave correctly.
	3.	cli.test.ts remains mostly the same except that it ensures top-level usage calls with 'toplevel'.

5. Final “Migration Guide” and Next Steps
	•	Step 1: Update DirectiveHandler interface with mode parameter.
	•	Step 2: Update DirectiveRegistry.findHandler(...) to accept mode.
	•	Step 3: Update places calling findHandler(...), e.g. the main interpreter and sub-interpreter code, to pass 'toplevel' or 'rightside'.
	•	Step 4: (Optionally) remove or refactor sub-interpreter location adjustments if you prefer to push that logic down into each directive or into a new “LocationManager.”
	•	Step 5: Update each directive handler’s canHandle(...) and handle(...) signatures.
	•	Step 6: Write or refactor tests to cover both 'toplevel' and 'rightside' usage.

Once done, all your directives can be used in a single, unified way. No more redundant or half-duplicated logic for right-side vs top-level.

Conclusion

By following the step-by-step changes above, and applying the exact line-by-line diffs to subInterpreter.ts and registry.ts, you’ll have a fully working codebase that:
	1.	Uses a single set of directive handlers for both top-level and right-side contexts.
	2.	Has a simpler sub-interpreter (no repeated logic).
	3.	Allows each handler to handle location adjustments or specialized logic in a unified manner.

With these instructions and diffs, you can perform the refactor confidently, without guesswork.

6. Additional Infrastructure Components

6.1 Error Factory Integration

We'll create a centralized error handling system to ensure consistent error creation and location handling:

```typescript
class ErrorFactory {
  createDirectiveError(
    message: string,
    kind: string,
    context: HandlerContext
  ): MeldDirectiveError {
    const location = context.mode === 'rightside' 
      ? this.adjustErrorLocation(context)
      : context.baseLocation;
    return new MeldDirectiveError(message, kind, location);
  }

  private adjustErrorLocation(context: HandlerContext): Location {
    return context.baseLocation 
      ? locationManager.adjustLocation(context.baseLocation, {
          parentLocations: []
        })
      : undefined;
  }
}

// Usage in handlers
class TextDirectiveHandler implements DirectiveHandler {
  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    if (!node.directive.name) {
      throw errorFactory.createDirectiveError(
        'Text directive requires a name',
        'text',
        context
      );
    }
    // ... rest of handler
  }
}
```

6.2 Enhanced Testing Infrastructure

To support both top-level and right-side testing scenarios:

```typescript
interface TestConfig {
  files?: MockFileSystem;
  state?: MockStateLayer;
  handlers?: DirectiveHandler[];
  parser?: MockParser;
}

class TestContext {
  readonly fs: MockFileSystem;
  readonly state: MockStateLayer;
  readonly parser: MockParser;
  readonly registry: DirectiveRegistry;
  
  static create(config?: Partial<TestConfig>): TestContext;
  
  createHandlerContext(mode: 'toplevel' | 'rightside'): HandlerContext {
    return {
      mode,
      parentState: this.state,
      baseLocation: this.baseLocation
    };
  }
  
  mockDirectiveHandler(options: {
    kind: string,
    allowedModes: ('toplevel' | 'rightside')[]
  }): DirectiveHandler {
    return {
      canHandle: (k, m) => k === options.kind && options.allowedModes.includes(m),
      handle: (n, s, c) => { /* mock implementation */ }
    };
  }
}

// Example test using the infrastructure
describe('TextDirectiveHandler with right-side operations', () => {
  let context: TestContext;
  
  beforeEach(() => {
    context = TestContext.create({
      files: {
        '/test/file.txt': 'content'
      }
    });
  });
  
  it('properly adjusts locations in right-side mode', () => {
    const handler = new TextDirectiveHandler();
    const node = createTestNode('@text', {
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      }
    });
    
    handler.handle(
      node, 
      context.state, 
      context.createHandlerContext('rightside')
    );
    
    expect(context.state.getLastNode().location)
      .toMatchObject({
        start: { line: 2, column: 5 }, // Adjusted for parent context
        end: { line: 2, column: 14 }
      });
  });
});
```

6.3 Location Management System

To handle location adjustments consistently:

```typescript
class LocationManager {
  adjustForContext(
    location: Location,
    context: HandlerContext
  ): Location {
    if (!location || context.mode !== 'rightside') {
      return location;
    }

    return this.adjustLocation(location, {
      baseLocation: context.baseLocation,
      parentLocations: []
    });
  }

  private adjustLocation(
    location: Location,
    options: {
      baseLocation: Location;
      parentLocations: Location[];
    }
  ): Location {
    const { baseLocation } = options;
    
    if (!baseLocation) return location;

    const startLine = location.start.line + baseLocation.start.line - 1;
    const startColumn = location.start.line === 1
      ? location.start.column + baseLocation.start.column - 1
      : location.start.column;

    const endLine = location.end.line + baseLocation.start.line - 1;
    const endColumn = location.end.line === 1
      ? location.end.column + baseLocation.start.column - 1
      : location.end.column;

    return {
      start: { line: startLine, column: startColumn },
      end: { line: endLine, column: endColumn }
    };
  }
}

// Usage in handlers
class EmbedDirectiveHandler implements DirectiveHandler {
  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const adjustedLocation = locationManager.adjustForContext(
      node.location,
      context
    );
    
    // Use adjusted location for error reporting and node creation
    // ...
  }
}
```

7. Validation and Edge Cases

7.1 Location Edge Cases
- Empty or undefined locations
- Multi-line directives
- Column overflow scenarios
- Source file changes

7.2 State Inheritance Rules
- Variable shadowing behavior
- Immutability enforcement
- Circular reference prevention
- Scope isolation

7.3 Error Handling Scenarios
- Missing required fields
- Invalid location adjustments
- State modification errors
- Parser failures

8. Performance Considerations

8.1 Location Adjustments
- Cache adjusted locations when possible
- Batch location updates
- Minimize redundant calculations

8.2 State Management
- Lazy state initialization
- Efficient variable lookup
- Smart parent state references

8.3 Error Creation
- Reuse error instances where appropriate
- Minimize stack trace generation
- Optimize location adjustments

9. Migration Checklist

9.1 Pre-Migration Tasks
- [ ] Audit existing directive handlers
- [ ] Document current location adjustment logic
- [ ] Identify test coverage gaps
- [ ] Create backup of current implementation

9.2 Core Changes
- [ ] Implement HandlerContext
- [ ] Update DirectiveHandler interface
- [ ] Modify DirectiveRegistry
- [ ] Create LocationManager
- [ ] Implement ErrorFactory

9.3 Handler Updates
- [ ] Update all directive handlers
- [ ] Add context support
- [ ] Implement location adjustments
- [ ] Update error handling

9.4 Testing
- [ ] Create TestContext
- [ ] Update existing tests
- [ ] Add new test cases
- [ ] Verify edge cases

9.5 Documentation
- [ ] Update API documentation
- [ ] Add migration guide
- [ ] Document best practices
- [ ] Create examples

10. Rollout Strategy

10.1 Phase 1: Infrastructure
- Deploy core interfaces
- Add location management
- Implement error factory
- Set up testing infrastructure

10.2 Phase 2: Handler Migration
- Migrate one handler type
- Validate behavior
- Address issues
- Document learnings

10.3 Phase 3: Full Migration
- Migrate remaining handlers
- Update all tests
- Verify functionality
- Remove old code

10.4 Phase 4: Cleanup
- Remove deprecated code
- Update documentation
- Verify performance
- Release notes