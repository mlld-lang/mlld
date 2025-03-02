
# Testing Framework Integration for Debug Issue Detection

## Overview

This feature extends the Debug Issue Detection system to be usable within automated testing frameworks like Jest or Vitest. It provides APIs and utilities that make it easy for developers to track, detect, and assert on debug issues during test execution.

## Problem Statement

Currently, Meld developers have limited ways to verify variable resolution behavior in their automated tests. When tests fail due to template rendering issues, they must manually debug the problem. This is time-consuming and makes it difficult to create regression tests for complex variable resolution behaviors.

## Goals

- Provide a clean, intuitive API for enabling debug tracking within tests
- Make debug data and issue detection results easily accessible in test code
- Create custom matchers/assertions for common debug-related checks
- Support snapshot testing of issue detection results
- Minimize performance overhead in test execution

## Non-Goals

- Creating a completely new testing framework
- Supporting every possible testing framework (initial focus on Jest/Vitest)
- Automatically fixing issues detected during tests
- Creating UI/visual test reports (output will be text/console based)

## Feature Requirements

### Debug API for Tests

Implement a core API that provides:

1. **Configuration Control**
   - Enable/disable debug tracking in tests
   - Specify which variables to track
   - Control sampling rate and other performance parameters

2. **Data Access**
   - Retrieve debug data for specific variables
   - Access aggregated debug data for all tracked variables
   - Get raw resolution attempts and boundary crossings

3. **Issue Detection**
   - Run issue detection on debug data
   - Filter issues by type, severity, or other criteria
   - Format issues for test output

### Custom Matchers/Assertions

Create custom assertion utilities for common checks:

1. **Resolution Success Checks**
   - `toBeResolved` - Check if a variable is successfully resolved
   - `toBeResolvedInContext` - Check if a variable is resolved in a specific context
   - `toHaveConsistentResolution` - Check if a variable is resolved consistently

2. **Issue Detection Checks**
   - `toHaveNoIssues` - Check if there are no issues detected
   - `toHaveNoIssuesOfType` - Check if there are no issues of a specific type
   - `toHaveIssueMatching` - Check if there's an issue matching specific criteria

3. **Boundary Crossing Checks**
   - `toCrossBoundaries` - Check if a variable crosses context boundaries
   - `toCrossBoundaryBetween` - Check if a variable crosses from one specific context to another

### Mock Testing Utilities

Provide utilities to create mock debug data for testing issue detectors:

1. **Mock Data Creation**
   - Create mock resolution attempts
   - Create mock boundary crossings
   - Build complete mock debug results

2. **Common Scenario Generators**
   - Generate mock data for unresolved variables
   - Generate mock data for circular dependencies
   - Generate mock data for inconsistent resolution

### Integration with Test Runners

Ensure the API works well with different test execution flows:

1. **Jest Integration**
   - Proper cleanup between tests
   - Compatible with Jest's async test model
   - Support for custom matchers

2. **Vitest Integration**
   - Support for Vitest's execution model
   - Compatible with watch mode and HMR

## Technical Implementation

### Core Test API

```typescript
// Main API for enabling debug tracking in tests
export function enableDebugTracking(options: DebugTrackingOptions = {}): void {
  const defaultOptions: DebugTrackingOptions = {
    enabled: true,
    trackVariables: [],
    detectIssues: true,
    samplingRate: 1.0,
    maxAttempts: 1000
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  debugTracker.configure(mergedOptions);
}

// Get debug data for a specific variable
export async function getDebugData(variableName?: string): Promise<DebugResult> {
  if (variableName) {
    return debugTracker.getDebugDataForVariable(variableName);
  } else {
    return debugTracker.getAllDebugData();
  }
}

// Run issue detection on debug data
export function detectIssues(
  debugData: DebugResult, 
  options: IssueDetectionOptions = {}
): Issue[] {
  const detector = new IssueDetectorService(options);
  return detector.detectIssues(debugData);
}

// Format issues for test output
export function formatIssues(
  issues: Issue[], 
  format: 'text' | 'json' = 'text'
): string {
  if (format === 'json') {
    return JSON.stringify(issues, null, 2);
  }
  
  return issues.map(issue => 
    `${issue.severity.toUpperCase()}: ${issue.message}\n` +
    `  Contexts: ${issue.contexts.join(', ')}\n` +
    `  Suggestions:\n${issue.suggestions.map(s => `    - ${s}`).join('\n')}`
  ).join('\n\n');
}
```

### Custom Matchers for Jest

```typescript
import { getDebugData, detectIssues } from '@meld/debug';

// Custom matcher to check if a variable resolves successfully
expect.extend({
  async toBeResolved(variableName: string) {
    // Get debug data for the variable
    const debugData = await getDebugData(variableName);
    
    // Check if there are any successful resolution attempts
    const hasSuccessfulResolution = debugData.attempts.some(attempt => attempt.success);
    
    if (hasSuccessfulResolution) {
      return {
        pass: true,
        message: () => `Expected variable "${variableName}" not to be resolved, but it was`
      };
    } else {
      return {
        pass: false,
        message: () => `Expected variable "${variableName}" to be resolved, but it wasn't`
      };
    }
  },
  
  // Custom matcher to check for issues
  async toHaveNoIssues(debugDataOrVariableName: DebugResult | string) {
    // Get debug data if a variable name was provided
    const debugData = typeof debugDataOrVariableName === 'string'
      ? await getDebugData(debugDataOrVariableName)
      : debugDataOrVariableName;
    
    // Detect issues
    const issues = detectIssues(debugData);
    
    if (issues.length === 0) {
      return {
        pass: true,
        message: () => `Expected to find issues, but none were detected`
      };
    } else {
      return {
        pass: false,
        message: () => `Found ${issues.length} issues:\n${formatIssues(issues)}`
      };
    }
  }
});
```

### Mock Data Utilities

```typescript
// Create mock resolution attempt
export function createMockResolutionAttempt(
  overrides: Partial<ResolutionAttempt> = {}
): ResolutionAttempt {
  return {
    variableName: 'mockVariable',
    context: 'mockContext',
    contextId: 'ctx_123',
    timestamp: Date.now(),
    duration: 5,
    success: true,
    value: 'mock value',
    source: 'mockResolver',
    ...overrides
  };
}

// Create mock boundary crossing
export function createMockBoundaryCrossing(
  overrides: Partial<BoundaryCrossing> = {}
): BoundaryCrossing {
  return {
    type: 'parent-to-child',
    variableName: 'mockVariable',
    from: 'mockParentContext',
    fromId: 'ctx_parent',
    to: 'mockChildContext',
    toId: 'ctx_child',
    success: true,
    timestamp: Date.now(),
    value: 'mock value',
    ...overrides
  };
}

// Create mock debug result
export function createMockDebugResult(
  overrides: Partial<DebugResult> = {}
): DebugResult {
  return {
    variable: 'mockVariable',
    attempts: [createMockResolutionAttempt()],
    boundaries: [createMockBoundaryCrossing()],
    ...overrides
  };
}

// Create mock data for common scenarios
export const mockScenarios = {
  unresolvedVariable() {
    return createMockDebugResult({
      attempts: [
        createMockResolutionAttempt({ success: false, error: 'Variable not found' }),
        createMockResolutionAttempt({ success: false, error: 'Variable not found', context: 'anotherContext' })
      ]
    });
  },
  
  inconsistentResolution() {
    return createMockDebugResult({
      attempts: [
        createMockResolutionAttempt({ success: true, value: 'value1', context: 'context1' }),
        createMockResolutionAttempt({ success: true, value: 'value2', context: 'context2' })
      ]
    });
  },
  
  circularDependency() {
    return createMockDebugResult({
      boundaries: [
        createMockBoundaryCrossing({ from: 'fileA', to: 'fileB' }),
        createMockBoundaryCrossing({ from: 'fileB', to: 'fileC' }),
        createMockBoundaryCrossing({ from: 'fileC', to: 'fileA' })
      ]
    });
  }
};
```

## Sample Usage

### Basic Usage Example

```typescript
import { enableDebugTracking, getDebugData, detectIssues } from '@meld/debug';

test('should correctly resolve imported variables', async () => {
  // Enable debug tracking for this test
  enableDebugTracking({
    trackVariables: ['userData', 'config']
  });
  
  // Run the test
  const result = await processTemplate('template.meld');
  
  // Assert on the result
  expect(result).toContain('Expected output');
  
  // Check debug data
  const debugData = await getDebugData('userData');
  const issues = detectIssues(debugData);
  
  // Log issues if any were found
  if (issues.length > 0) {
    console.log('Issues detected:', formatIssues(issues));
  }
  
  // Make assertions about debug results
  expect(issues.length).toBe(0);
});
```

### Custom Matchers Example

```typescript
import { enableDebugTracking } from '@meld/debug';
import '@meld/debug/matchers'; // Import custom matchers

test('variables should resolve correctly', async () => {
  enableDebugTracking();
  
  await processTemplate('template.meld');
  
  // Use custom matchers
  await expect('userData').toBeResolved();
  await expect('userData').toBeResolvedInContext('importedFile.meld');
  await expect('userData').toHaveNoIssues();
});
```

### Mock Testing Example

```typescript
import { detectIssues, mockScenarios } from '@meld/debug';

test('should detect unresolved variables', () => {
  // Create mock data for unresolved variable scenario
  const mockData = mockScenarios.unresolvedVariable();
  
  // Run issue detection
  const issues = detectIssues(mockData);
  
  // Assert on issues
  expect(issues).toHaveLength(1);
  expect(issues[0].type).toBe('unresolved_variable');
  expect(issues[0].severity).toBe('error');
});
```

## Implementation Approach

### Phase 1: Core API (1-2 days)

1. Implement the core debug tracking API for tests
2. Create data access and issue detection functions
3. Ensure proper test isolation and cleanup

### Phase 2: Custom Matchers (1-2 days)

1. Implement custom matchers for Jest/Vitest
2. Create documentation for matcher usage
3. Test with real-world debugging scenarios

### Phase 3: Mock Utilities (1-2 days)

1. Create mock data creation utilities
2. Implement common scenario generators
3. Test issue detectors with mock data

## Acceptance Criteria

1. Debug tracking can be enabled and configured in test files
2. Debug data and issues can be accessed and asserted on in tests
3. Custom matchers provide clear, helpful error messages
4. Mock utilities accurately simulate real debug scenarios
5. Performance impact on test execution is minimal
6. Documentation clearly explains how to use the testing utilities

## Estimated Effort

Total effort: **3-6 days**

- Core API: 1-2 days
- Custom Matchers: 1-2 days
- Mock Utilities: 1-2 days