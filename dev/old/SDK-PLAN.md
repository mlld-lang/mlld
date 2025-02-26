-------------------------
Model: o1
System: _meld/partials/meld-architect.md
Response:
Below is the definitive plan for updating both api/index.ts and api/api.test.ts to implement our richer, more modular service setup. This plan incorporates key architectural decisions and provides clear implementation guidance.

──────────────────────────────────────────────────────────────────────────────────
1. Changes to api/index.ts
──────────────────────────────────────────────────────────────────────────────────

1.1 Implement Service Object Pattern ✅
   • We will use a simple services object literal pattern (not a formal container class) ✅
   • Services object structure: ✅
       interface Services {
         parser: ParserService;
         interpreter: InterpreterService;
         state: StateService;
         resolution: ResolutionService;
         path: PathService;
         validation: ValidationService;
         circularity: CircularityService;
         directive: DirectiveService;
         output: OutputService;
         debug?: DebuggerService;
       }

1.2 Define Service Initialization Order ✅
   • Services must be initialized in this specific order: ✅
     1. FileSystemService (base dependency)
     2. PathService (depends on FS)
     3. StateService (core state)
     4. ParserService (independent)
     5. ResolutionService (depends on State, FS)
     6. ValidationService (depends on Resolution)
     7. CircularityService (depends on Resolution)
     8. DirectiveService (depends on multiple services)
     9. InterpreterService (orchestrates others)
     10. OutputService (depends on State)
     11. DebuggerService (optional, depends on all)

1.3 Implement ProcessOptions Interface ✅
   interface ProcessOptions {
     transformation?: boolean;     // Controls transformation mode
     format?: OutputFormat;       // Controls output format
     debug?: boolean;            // Enables/disables debugging
     fs?: FileSystemService;     // Optional custom FS
     services?: Partial<Services>; // Optional service overrides
   }

1.4 Service Lifecycle Management ✅
   • main() will create fresh service instances by default ✅
   • Service injection only allowed through ProcessOptions ✅
   • Example implementation: ✅
       export async function main(path: string, options: ProcessOptions = {}) {
         const services = options.services || createDefaultServices(options);
         if (options.transformation) {
           services.state.enableTransformation(true);
         }
         // ... rest of implementation
       }

1.5 Debug Infrastructure ✅
   • Debugging is conditionally enabled via ProcessOptions.debug ✅
   • Production uses no-op implementation by default ✅
   • Debug service only initialized if options.debug === true ✅

──────────────────────────────────────────────────────────────────────────────────
2. Changes to api/api.test.ts
──────────────────────────────────────────────────────────────────────────────────

2.1 Enhanced TestContext Implementation ✅
   interface TestContext {
     fs: FileSystemService;
     services: Services;
     // Helper methods
     enableTransformation(): void;
     disableTransformation(): void;
     setFormat(format: OutputFormat): void;
     enableDebug(): void;
     disableDebug(): void;
     reset(): void;  // Resets all services to initial state
   }

2.2 Test Service Configuration ✅
   • beforeEach must initialize services in correct order ✅
   • Example implementation: ✅
       beforeEach(function() {
         this.fs = new MemfsTestFileSystem();
         this.services = createTestServices(this.fs);
         this.context = new TestContext(this.fs, this.services);
       });

2.3 Transformation Testing ✅
   • Each test must explicitly set transformation mode ✅
       it('transforms directives', function() {
         this.context.enableTransformation();
         // ... test implementation
       });

2.4 Standard Test Pattern ✅
   • Example of complete test: ✅
       it('processes file with transformation', async function() {
         // Setup
         this.context.enableTransformation();
         this.context.setFormat('markdown');
         
         // Execute
         const result = await main('test.md', {
           services: this.context.services,
           transformation: true,
           format: 'markdown'
         });
         
         // Verify
         expect(result).to.include('transformed content');
       });

2.5 Debug Testing ✅
   • Debug tests must explicitly enable debugging ✅
       it('captures debug info', function() {
         this.context.enableDebug();
         // ... test implementation
       });

──────────────────────────────────────────────────────────────────────────────────
3. Implementation Order
──────────────────────────────────────────────────────────────────────────────────

3.1 Phase 1: Core Infrastructure ✅
   1. Implement ProcessOptions interface ✅
   2. Create service initialization order ✅
   3. Implement basic service object pattern ✅
   4. Add transformation mode support ✅

3.2 Phase 2: Test Infrastructure ✅
   1. Enhance TestContext implementation ✅
   2. Add helper methods ✅
   3. Update existing tests to use new patterns ✅
   4. Add new test coverage for transformation ✅

3.3 Phase 3: Debug Infrastructure ✅
   1. Implement no-op debug service ✅
   2. Add conditional debug initialization ✅
   3. Add debug-specific tests ✅
   4. Update existing debug usage ✅

3.4 Phase 4: Validation & Cleanup ✅
   1. Verify all services initialize correctly ✅
   2. Confirm test coverage ✅
   3. Update documentation ✅
   4. Performance testing ✅

──────────────────────────────────────────────────────────────────────────────────
4. Targeted Improvements
──────────────────────────────────────────────────────────────────────────────────

4.1 Service Dependency Documentation and Validation ✅
   • Pipeline-focused dependency graph ✅
   • Pipeline-Specific Benefits ✅
   • Key Pipeline Dependencies ✅
   • Critical State Sharing ✅

4.2 Enhanced Pipeline Validation ✅
   • Pipeline integrity validation ✅
   • Integration points ✅

4.3 Initialization Error Improvements ✅
   • Create specific initialization error type ✅
   • Benefits implemented ✅

4.4 Testing Enhancements ✅
   • Add specific initialization test cases ✅
   • Example test pattern ✅

──────────────────────────────────────────────────────────────────────────────────
5. Implementation Plan
──────────────────────────────────────────────────────────────────────────────────

5.1 Phase 1: Service Dependency Documentation ✅
   • Create new file: core/types/dependencies.ts ✅
     - Define SERVICE_DEPENDENCIES constant ✅
     - Add TypeScript types for dependency validation ✅
     - Add JSDoc documentation explaining the dependency structure ✅

5.2 Phase 2: Basic Validation ✅
   • Create error types ✅
     - Create ServiceInitializationError class ✅
     - Add error codes and types ✅

   • Implement basic validation ✅
     - Required services check ✅
     - Simple dependency validation ✅
     - Integration with createDefaultServices ✅

5.3 Phase 3: Pipeline Testing Infrastructure ✅
   • Create test files ✅
     - Core Pipeline Tests ✅
     - Transformation Tests ✅
     - Content Flow Tests ✅
     - Error Cases ✅

5.4 Integration Points ✅
   • createDefaultServices() ✅
     - Add validation as final step ✅
     - Update error handling ✅

   • main() ✅
     - Add validation after service injection ✅
     - Handle initialization errors ✅

   • TestContext ✅
     - Add validation to initialization ✅
     - Add helper methods for testing ✅

5.5 Rollout Strategy ✅
   1. PR #1: Service Dependency Documentation ✅
      - Add dependencies.ts ✅
      - Add types and documentation ✅
      - No functional changes ✅

   2. PR #2: Basic Validation ✅
      - Add error types ✅
      - Implement basic validation ✅
      - Update createDefaultServices ✅

   3. PR #3: Testing and Enhanced Validation ✅
      - Add test suite ✅
      - Implement dependency validation ✅
      - Add TestContext integration ✅

✅ COMPLETED - All sections implemented and tested
