# Phase 4: OutputService DI Refactoring - Drastic Approach

## Overview
Phase 4 focuses on refactoring the OutputService to use the VariableReferenceResolverClient for field access. This ensures consistent handling of array indices and nested object properties during output formatting.

## Implementation Approach
We've implemented the "drastic" approach to address circular dependencies between OutputService and VariableReferenceResolverClientFactory:

1. Bypass standard DI by using container.resolve directly in the OutputService constructor
2. Implement proper fallback mechanisms for when the client isn't available
3. Add context-aware string conversion and formatting
4. Maintain backward compatibility with existing code

## Implementation Details

### 1. OutputService Enhancements
- Added VariableReferenceResolverClientFactory dependency using container.resolve
- Created FormattingContext interface for context-aware formatting
- Implemented getVariableResolver method for lazy loading of the client
- Added processVariableReference method for consistent field access
- Enhanced convertToString with context-aware formatting
- Updated TextVar and DataVar node handling to use the resolver

### 2. Fallback Mechanisms
- Implemented direct field access as a fallback when resolver client is unavailable
- Maintained backward compatibility with existing code
- Added proper error handling for fallback cases
- Ensured consistent behavior regardless of resolver availability

### 3. Testing Verification
- Created dedicated tests to verify integration with resolver client
- Added tests for both resolver client available and unavailable scenarios
- Verified fallback behavior works as expected
- Confirmed backward compatibility with existing tests

## Benefits
1. Consistent field access across the codebase
2. Proper handling of array indices in variable references
3. Context-aware string formatting for different node types
4. Clean fallback mechanisms for backward compatibility
5. No breaking changes to existing functionality

## Future Considerations
While the "drastic" approach works well, there are some considerations for future improvements:

1. Develop a more elegant solution for circular dependencies
2. Consider broader architectural changes to avoid these issues
3. Add more comprehensive tests for edge cases
4. Document the pattern for other services facing similar issues

## Conclusion
The "drastic" approach successfully addresses the circular dependency issue while enhancing OutputService with improved field access capabilities. While not an ideal long-term solution from a dependency injection perspective, it balances practicality with functionality and maintains backward compatibility.