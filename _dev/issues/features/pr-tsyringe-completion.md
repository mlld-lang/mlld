# Implement TSyringe DI Refactoring Phases 4-5

This PR completes phases 4 and 5 of the TSyringe dependency injection (DI) refactoring as defined in the [original plan](/_issues/features/tsyringe-refactor.md).

## Changes

### Phase 4: Handle Circular Dependencies
- Implemented handling for circular dependencies between DirectiveService and InterpreterService using tsyringe's `@delay` decorator
- Added lazy loading with `setTimeout` to ensure proper initialization
- Updated DirectiveService, InterpreterService, and OutputService with constructor injection
- Maintained backward compatibility with the feature flag

### Phase 5: Entry Point and Bootstrap Refactoring
- Refactored main entry points (api/index.ts and cli/index.ts) to use the DI container
- Added conditional service creation based on feature flag for backward compatibility
- Added CLI option `--use-di` to enable DI from command line
- Updated API entry point to accept the DI feature flag

## Testing
- All tests pass with both `USE_DI=true` and `USE_DI=false`
- Added feature flag toggle to CLI for easy testing of both modes
- Verified all circular dependencies are properly resolved

## Documentation
- Created summary of Phases 4-5 implementation in `_issues/features/tsyringe-phases4-5-summary.md`
- Created detailed plan for Phase 6 (finalization) in `_issues/features/tsyringe-phase6.md`

## Next Steps
Phase 6 will be merging the current active dev branch into the tsyringe branch and solving any merge conflicts that arise.

Phase 7 will review our current test infrastructure and make a careful plan for how we must migrate 

Phase 8 will perform that test migration methodically and deliberately, ensuring all tests still pass before moving on to updating the next test.

Phase 9 will finalize the DI implementation by removing the feature flag, removing the ServiceProvider adapter, cleaning up legacy initialization code, and adding comprehensive DI-specific tests.

## Related Issues
Addresses phases 4-5 of the TSyringe refactoring plan.