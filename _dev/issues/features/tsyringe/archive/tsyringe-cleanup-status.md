# TSyringe Dependency Injection Cleanup Status

## What's Been Implemented

1. **Service Provider Changes**:
   - Modified `shouldUseDI()` to always return true (DI is now mandatory)
   - Updated `createService` to always use DI
   - Simplified all service resolution/registration functions to always use DI
   - Updated the `Service` decorator to be cleaner and more focused

2. **Path Normalization**:
   - Added a standardized `normalizeMeldPath` function in PathOperationsService
   - Provided both an instance method and a standalone function
   - Implemented a consistent path format with:
     - Always forward slashes (never backslashes)
     - Paths always start with a slash
     - No trailing slashes except for root

3. **TestSnapshot Improvements**:
   - Refactored to use the standardized path normalization
   - Removed brittle test suite detection logic
   - Simplified the comparison algorithm

4. **Documentation**:
   - Created comprehensive DI documentation at `docs/dev/DI.md`
   - Added best practices, patterns, and troubleshooting info
   - Documented the path normalization approach

## Known Issues

1. **Test Failures**:
   The changes have introduced test failures that need to be addressed:
   - The TestContext setup needs to properly initialize StateFactory
   - Some tests rely on the dual-mode pattern and need updating
   - Path normalization changes may affect test expectations

2. **StateService Constructor Updates**:
   - The private property initialization via constructor parameters caused issues
   - Had to revert to explicit property assignment in the constructor body

## Next Steps

1. **Fix Test Framework**:
   - Update TestContext and TestContextDI to properly initialize with DI
   - Make all tests compatible with DI-only mode

2. **Complete Service Updates**:
   - Simplify all service constructors to follow the new pattern
   - Remove legacy initialize() methods in favor of proper constructor injection

3. **Path Normalization Integration**:
   - Apply the normalizeMeldPath consistently across the codebase

4. **Documentation Updates**:
   - Add more examples of DI usage in the codebase
   - Document the path normalization standards
   - Update architecture documentation to reflect DI concepts

## Observations and Lessons

1. **Incremental Migration**:
   The dual-mode pattern allowed tests to pass during the migration, but made code more complex and harder to reason about. A more incremental approach to migration would have been:
   - First update all tests to work with DI
   - Then simplify services to use DI only
   - Then remove the dual-mode pattern

2. **Proper Test Isolation**:
   The test suite relies heavily on global state and environment variables, making it fragile to changes. Moving forward, we should:
   - Use proper test isolation with TestContextDI
   - Explicitly configure each test's environment
   - Avoid relying on global state

3. **Path Normalization Importance**:
   Path handling was inconsistent across the codebase, causing subtle bugs. The new centralized approach will:
   - Provide a single source of truth for path formats
   - Make tests more reliable across different platforms
   - Simplify path comparison logic

## Long-term Technical Debt Items

1. **Container Organization**:
   - Consider a more structured approach to dependency registration
   - Group related services into modules
   - Improve error handling for common DI issues

2. **Test Framework Improvements**:
   - Create a more robust test framework that doesn't rely on global state
   - Add better utilities for testing with dependencies
   - Improve error messages for DI-related test failures

3. **Service Lifecycle Management**:
   - Add proper lifecycle hooks for services (init, destroy)
   - Consider scoped dependencies for specific contexts