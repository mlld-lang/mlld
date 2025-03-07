# Implement TSyringe DI Refactoring - Phases 6-7 Completion

This PR completes Phases 6 and 7 of the TSyringe dependency injection (DI) refactoring, focusing on Test Infrastructure DI Support and Entry Point Integration.

## Changes

### Phase 7: Entry Point Integration
- Updated API entry points to properly use DI container
- Added CLI option `--use-di` and `--no-di` for toggling DI mode
- Updated ProcessOptions type to include useDI option
- Updated help text to document DI options
- Included support for custom filesystem registration with DI
- Ensured both API and CLI entry points support DI and non-DI modes

### Phase 6: Test Infrastructure DI Support Completion
- Added `@injectable()` decorator to all remaining directive handlers:
  - ImportDirectiveHandler
  - RunDirectiveHandler
- Added `@Service()` decorator with descriptions to provide better metadata
- Updated constructor parameters with `@inject()` decorators for proper DI container resolution in:
  - ValidationService 
  - CircularityService
  - Multiple DirectiveHandlers (Data, Define, Path, Embed, Import, Run)
- Registered CircularityService in the DI container in core/di-config.ts
- Fixed import orders and maintained consistent code style across files
- Verified all tests pass with USE_DI=true environment flag

## Implementation Details
- Used consistent token naming matching existing patterns (e.g., 'IValidationService')
- Maintained backward compatibility with non-DI mode
- Followed the established pattern for service registration in di-config.ts
- Used proper decorator syntax for class and constructor parameter decoration
- Implemented runtime detection of DI mode via environment variable
- Added support for toggling DI mode from CLI and API options

## Testing
- All tests pass with both `USE_DI=true` and `USE_DI=false`
- Validated specific directive handler tests with USE_DI=true
- Verified all integration tests continue to pass
- Tested entry point integration with DI enabled

## Previous Phases
### Phase 4: Handle Circular Dependencies
- Implemented handling for circular dependencies between DirectiveService and InterpreterService
- Added lazy loading to ensure proper initialization
- Updated key services with constructor injection

### Phase 5: Entry Point and Bootstrap Refactoring
- Refactored main entry points to use the DI container
- Added conditional service creation for backward compatibility

## Next Steps
- Phase 8: Service Mock Updates for DI compatibility
- Phase 9: Final Cleanup and Documentation

## Related Issues
Addresses Phases 6-7 of the TSyringe refactoring plan, focusing on Test Infrastructure DI Support and Entry Point Integration.