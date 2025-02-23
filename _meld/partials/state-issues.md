**Problem:**
- Meld's directive transformation system is failing in several ways:
  1. State management errors ("currentState.clone is not a function")
  2. Inconsistent directive transformation (raw directives like "@run [echo test]" showing up in output instead of their processed results)
  3. Mismatches between real service implementations and test mocks
  4. 7 failing tests (4 API tests, 3 OutputService transformation tests)

**Solution:**

- Align and fix three key components:
  1. Service Interfaces
     - Ensure IStateService interface matches actual implementation
     - Make all mocks fully implement the interface
     - Fix partial/incomplete mock implementations
  
  2. State Management
     - Properly implement state cloning
     - Ensure transformation state is preserved during cloning
     - Fix state inheritance in nested operations
  
  3. Transformation Rules
     - Establish consistent rules for directive transformation
     - Ensure directives are properly replaced with their output in transformation mode
     - Standardize how transformed nodes are handled across all services
