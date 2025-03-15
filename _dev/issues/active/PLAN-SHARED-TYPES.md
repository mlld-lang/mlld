# Shared Types Implementation: Completion Plan

## Summary of Current Status

The shared types pattern has been partially implemented to address circular dependencies in the Meld codebase. The core architecture has been established with:

- Creation of foundation files (`core/shared/types.ts` and `core/shared-service-types.ts`)
- Updated interfaces for key services to use shared types
- Implementation of client interfaces for some services
- Factory pattern integration for service instantiation

## Remaining Tasks (in priority order)

### Phase 1: Complete Core Shared Types Implementation

1. **Finalize Shared Types Files**
   - Review all shared types for completeness
   - Ensure all base interfaces have no dependencies
   - Validate naming conventions (`ServiceLike` suffix consistency)
   - Verify one-way dependency flow (shared types → interfaces → implementations)

2. **Update Remaining Service Interfaces**
   - Complete interface updates for any services not yet converted:
     - Verify `IResolutionService` uses `StateServiceLike`
     - Check `IParserService` implementations
     - Review `ICircularityService` dependencies
   - Ensure consistent extension from shared types
   - Specific files that need updating:
     - **State Services:**
       - `services/state/StateService/IStateService.ts` - Verify extension from StateServiceBase
       - `services/state/StateEventService/IStateEventService.ts` - Ensure extension from StateEventServiceBase
       - `services/state/StateTrackingService/interfaces/IStateTrackingServiceClient.ts` - Ensure shared types consistency
     - **Interpreter Service:**
       - `services/pipeline/InterpreterService/IInterpreterService.ts` - Update to use ServiceLike interfaces
       - `services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.ts` - Refine with shared types
     - **Directive Service:**
       - `services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.ts` - Use DirectiveNode from shared types
     - **FileSystem Services:**
       - `services/fs/FileSystemService/IFileSystemService.ts` - Verify FileSystemLike extension
       - `services/fs/FileSystemService/interfaces/IFileSystemServiceClient.ts` - Update for shared types consistency
       - `services/fs/FileSystemService/IPathOperationsService.ts` - Update parameter/return types
       - `services/fs/PathService/interfaces/IPathServiceClient.ts` - Align with PathServiceLike
     - **Display Services:**
       - `services/display/ErrorDisplayService/IErrorDisplayService.ts` - Update parameter types
       - `services/pipeline/OutputService/IOutputService.ts` - Use ServiceLike interfaces
     - **CLI Services:**
       - `services/cli/CLIService/ICLIService.ts` - Update dependencies to ServiceLike interfaces
     - **Resolution Services:**
       - `services/resolution/ResolutionService/interfaces/IResolutionServiceClient.ts` - Use ResolutionContextBase
       - `services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective.ts` - Use shared types
     - **Parser Service:**
       - `services/pipeline/ParserService/interfaces/IParserServiceClient.ts` - Verify alignment with ParserServiceLike

### Phase 2: Implementation Updates

3. **Update Service Implementations**
   - Align concrete service implementations with updated interfaces
   - Inject dependencies using factory pattern where appropriate
   - Ensure implementations correctly implement their interfaces
   - Verify runtime behavior matches design intentions

4. **Complete Client Interfaces**
   - Create missing client interfaces for cross-service communication
   - Implement client factories for all services with circular dependencies
   - Ensure client interfaces expose only necessary methods
   - Update service constructors to use client factories

5. **Factory Implementation Validation**
   - Review factory implementations for correctness
   - Ensure factories return instances implementing correct interfaces
   - Verify lazy initialization for circular dependency breaking
   - Add fallback mechanisms where needed

### Phase 3: Build Configuration Updates

6. **Update Export Patterns**
   - Update barrel files with proper `export type` syntax
   - Fix interface exports to use type-only exports where appropriate
   - Ensure consistent naming and export conventions
   - Verify exports work in both TypeScript and at runtime

7. **TypeScript Configuration**
   - Update `tsconfig.json` settings for proper module resolution
   - Consider adding `noEmitOnError: false` temporarily if needed
   - Add `declarationMap: true` for improved declaration file debugging
   - Review module resolution settings (`NodeNext` vs `Node16`)

8. **Bundler Configuration**
   - Update tsup configuration to fix splitting issues
   - Separate ESM and CJS builds properly
   - Remove splitting from CJS build (only works with ESM)
   - Configure proper output formats

### Phase 4: Testing and Validation

9. **Test Suite Updates**
   - Update tests to use the new interfaces and factories
   - Create mocks based on shared interfaces where needed
   - Add specific tests for circular dependency scenarios
   - Verify all existing tests pass with the new implementation

10. **Validation Tests**
    - Create tests to verify type compatibility
    - Add validation for service interactions
    - Test boundary cases for circular dependencies
    - Verify factories create correct implementations

11. **Build Pipeline Verification**
    - Create a CI check to detect circular dependencies
    - Add linting rules to enforce shared types pattern
    - Set up automated testing for the build process
    - Test build in various environments

### Phase 5: Documentation and Guidelines

12. **Update Architecture Documentation**
    - Update existing architecture documentation to reflect new patterns
    - Add examples of correct usage for developers
    - Create visual diagrams of the new architecture
    - Document the rationale behind design decisions

13. **Developer Guidelines**
    - Create guidelines for adding new services
    - Document patterns for avoiding circular dependencies
    - Provide examples of correct interface definitions
    - Add troubleshooting guides for common issues

## Implementation Notes

### Addressing Build Issues

The immediate build issue appears to be related to TypeScript's export handling and bundler configuration:

1. **Export Syntax Fix**:
   ```typescript
   // Change from:
   export { IStateService } from './IStateService.js';
   
   // To:
   export type { IStateService } from './IStateService.js';
   ```

2. **tsup.config.ts Update**:
   ```javascript
   // For API build, separate ESM and CJS:
   {
     entry: { index: 'api/index.ts' },
     format: ['esm'],  // Remove 'cjs' when using splitting
     splitting: true,
   }
   
   // For CJS build (separate config):
   {
     entry: { index: 'api/index.ts' },
     format: ['cjs'],
     splitting: false, // Splitting doesn't work with CJS
   }
   ```

3. **TypeScript Config Update**:
   ```json
   {
     "compilerOptions": {
       "moduleResolution": "NodeNext",
       "noEmitOnError": false,
       "declarationMap": true
     }
   }
   ```

### Shared Types Best Practices

When completing the shared types implementation:

1. **Keep Shared Types Minimal**
   - Include only what's needed by multiple modules
   - Use interface extension for specialized requirements

2. **Use Consistent Naming**
   - Use `ServiceLike` suffix for shared service interfaces
   - Use `IServiceClient` for client interfaces

3. **Test Incrementally**
   - Update and test one service pair at a time
   - Ensure tests pass after each change

4. **Maintain One-Way Dependencies**
   - Ensure dependencies flow in one direction
   - Never import from implementation into interface definitions
   - Use shared types as intermediaries between potential circular dependencies 