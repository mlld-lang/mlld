## CODE ANALYSIS INSTRUCTIONS

1. INTERFACE ANALYSIS
   - Check method signatures match exactly
   - Verify parameter types and return types
   - Confirm optional parameters are consistent
   - Note any documentation mismatches

2. IMPLEMENTATION ANALYSIS
   - Verify all interface methods are implemented
   - Check for extra methods not in interface
   - Confirm implementation behavior matches docs
   - Note any partial or incomplete implementations

3. MOCK ANALYSIS
   - Compare mock methods to real implementations
   - Check mock return types match interface
   - Verify mock behavior in test scenarios
   - Note any missing or incomplete mock methods

4. TEST COVERAGE
   - Check which methods are actually tested
   - Note any untested code paths
   - Verify test assertions match requirements
   - Flag any inconsistent test behavior

IMPORTANT: Always check both the interface definition AND its usage in the codebase. Methods may be used that aren't properly defined in the interface. 