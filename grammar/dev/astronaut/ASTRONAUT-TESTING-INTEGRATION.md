# Test Fixture Generation and Integration

This document outlines the comprehensive approach for generating test fixtures and integrating them with our testing framework as part of the grammar-driven development system.

## Testing Philosophy

Our testing philosophy follows these key principles:

1. **Grammar-Driven Testing**: All test fixtures derive directly from the grammar
2. **Comprehensive Coverage**: Every directive, subtype, and feature has dedicated tests
3. **Parameterized Testing**: Test cases capture multiple variations and edge cases
4. **Snapshot Testing**: AST structure changes are explicitly reviewed and approved
5. **Regression Prevention**: Tests automatically detect unintended AST changes

## Test Fixture Components

The test fixture generation system consists of these key components:

### 1. Directive Example Fixtures

Basic examples of each directive and subtype:

```typescript
interface DirectiveFixture {
  name: string;
  description: string;
  directive: string;
  expected: {
    kind: string;
    subtype: string;
    // Other expected properties
  };
  options?: TestOptions;
}

// Example fixture
const textAssignmentFixture: DirectiveFixture = {
  name: "text-assignment-basic",
  description: "Basic text variable assignment with string literal",
  directive: '@text greeting = "Hello, world!"',
  expected: {
    kind: "text",
    subtype: "textAssignment",
    values: {
      identifier: [
        { type: "VariableReference", identifier: "greeting" }
      ],
      content: [
        { type: "Text", content: "Hello, world!" }
      ]
    },
    // Additional expected properties
  }
};
```

### 2. Parameterized Test Cases

Test matrices for variations of directives:

```typescript
interface ParameterizedTestCase {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    values: any[];
  }>;
  template: string; // Directive template with {param} placeholders
  expectedTemplate: DirectiveExpectedTemplate; // Template for expected AST
  options?: TestOptions;
}

// Example parameterized test case
const textAssignmentParameters: ParameterizedTestCase = {
  name: "text-assignment-variations",
  description: "Text assignment with different types of values",
  parameters: [
    {
      name: "value",
      values: [
        '"Simple string"',
        '"""Multi-line\nstring"""',
        '[[Template with {{var}}]]'
      ]
    }
  ],
  template: '@text greeting = {value}',
  expectedTemplate: {
    kind: "text",
    subtype: "textAssignment",
    values: {
      identifier: [
        { type: "VariableReference", identifier: "greeting" }
      ],
      content: TEST_PARAM_DEPENDENT // Special marker for parameter-dependent expectations
    }
  }
};
```

### 3. Edge Case Tests

Tests that focus on boundary conditions and special cases:

```typescript
interface EdgeCaseTest {
  name: string;
  description: string;
  directive: string;
  expected: any | ErrorExpectation;
  options?: TestOptions;
}

// Example edge case
const textDirectiveEdgeCases: EdgeCaseTest[] = [
  {
    name: "text-empty-value",
    description: "Text directive with empty string value",
    directive: '@text empty = ""',
    expected: {
      kind: "text",
      subtype: "textAssignment",
      values: {
        identifier: [
          { type: "VariableReference", identifier: "empty" }
        ],
        content: [
          { type: "Text", content: "" }
        ]
      }
    }
  },
  {
    name: "text-missing-identifier",
    description: "Text directive without identifier (should error)",
    directive: '@text = "value"',
    expected: {
      error: true,
      errorType: "SyntaxError",
      // Optional: more specific error expectations
    }
  }
];
```

### 4. AST Snapshots

Serialized AST structures for regression testing:

```typescript
interface ASTSnapshot {
  name: string;
  directive: string;
  ast: any;
  version: string; // Grammar version
  generatedAt: string; // Timestamp
}

// Example snapshot
const textAssignmentSnapshot: ASTSnapshot = {
  name: "text-assignment-basic",
  directive: '@text greeting = "Hello, world!"',
  ast: {
    type: "Directive",
    kind: "text",
    subtype: "textAssignment",
    // Full AST output
  },
  version: "1.0.0",
  generatedAt: "2023-06-15T12:34:56Z"
};
```

## Test Generation Architecture

The test fixture generation system architecture:

### 1. Test Fixture Generator

```typescript
interface TestFixtureGenerator {
  /**
   * Generate a basic test fixture for a directive
   */
  generateBasicFixture(
    directive: string,
    name: string,
    options?: GeneratorOptions
  ): Promise<DirectiveFixture>;
  
  /**
   * Generate parameterized test cases for a directive pattern
   */
  generateParameterizedTests(
    pattern: ParameterizedTestCase,
    options?: GeneratorOptions
  ): Promise<Array<DirectiveFixture>>;
  
  /**
   * Generate edge case tests for a directive
   */
  generateEdgeCaseTests(
    directives: string[],
    options?: GeneratorOptions
  ): Promise<Array<EdgeCaseTest>>;
  
  /**
   * Generate an AST snapshot for a directive
   */
  generateSnapshot(
    directive: string,
    name: string,
    options?: GeneratorOptions
  ): Promise<ASTSnapshot>;
}
```

### 2. Test Case Validator

```typescript
interface TestCaseValidator {
  /**
   * Validate that expected output matches actual AST
   */
  validateExpectedOutput(
    fixture: DirectiveFixture,
    actualAst: any
  ): ValidationResult;
  
  /**
   * Validate an AST against a snapshot
   */
  validateAgainstSnapshot(
    snapshot: ASTSnapshot,
    actualAst: any
  ): ValidationResult;
  
  /**
   * Check if AST changes are compatible with expected structure
   */
  checkASTCompatibility(
    oldAst: any,
    newAst: any,
    options?: CompatibilityOptions
  ): CompatibilityResult;
}
```

### 3. Test Code Generator

```typescript
interface TestCodeGenerator {
  /**
   * Generate test code for a basic fixture
   */
  generateBasicTest(
    fixture: DirectiveFixture,
    frameworkOptions?: FrameworkOptions
  ): string;
  
  /**
   * Generate test code for parameterized test cases
   */
  generateParameterizedTest(
    testCase: ParameterizedTestCase,
    frameworkOptions?: FrameworkOptions
  ): string;
  
  /**
   * Generate test code for edge cases
   */
  generateEdgeCaseTest(
    edgeCase: EdgeCaseTest,
    frameworkOptions?: FrameworkOptions
  ): string;
  
  /**
   * Generate snapshot test code
   */
  generateSnapshotTest(
    snapshot: ASTSnapshot,
    frameworkOptions?: FrameworkOptions
  ): string;
}
```

## Test Generation Process

Here's the detailed process for generating tests:

### 1. Basic Test Generation

```typescript
async function generateBasicTests(config: TestConfig): Promise<void> {
  // Load directive examples
  const examples = await loadDirectiveExamples(config.examplesDir);
  
  // Generate fixtures for each example
  const fixtures = await Promise.all(
    examples.map(async example => {
      return generator.generateBasicFixture(
        example.directive,
        example.name,
        { description: example.description }
      );
    })
  );
  
  // Generate test code for each fixture
  const testCode = fixtures.map(fixture => 
    testCodeGenerator.generateBasicTest(fixture, config.framework)
  );
  
  // Write test files
  await writeTestFiles(testCode, fixtures, config.outputDir);
  
  console.log(`Generated ${fixtures.length} basic tests`);
}
```

### 2. Parameterized Test Generation

```typescript
async function generateParameterizedTests(config: TestConfig): Promise<void> {
  // Load parameterized test definitions
  const parameterizedTests = await loadParameterizedTestDefinitions(config.parameterizedDir);
  
  // Generate test fixtures for each parameterized test
  const allFixtures = [];
  
  for (const testCase of parameterizedTests) {
    const fixtures = await generator.generateParameterizedTests(testCase);
    allFixtures.push(...fixtures);
    
    // Generate test code
    const testCode = testCodeGenerator.generateParameterizedTest(
      testCase,
      config.framework
    );
    
    // Write test file
    await writeTestFile(
      testCode,
      `${testCase.name}.test.${config.extension}`,
      config.outputDir
    );
  }
  
  console.log(`Generated ${allFixtures.length} parameterized test cases from ${parameterizedTests.length} test definitions`);
}
```

### 3. Edge Case Test Generation

```typescript
async function generateEdgeCaseTests(config: TestConfig): Promise<void> {
  // Load edge case test definitions
  const edgeCases = await loadEdgeCaseDefinitions(config.edgeCasesDir);
  
  // Generate test fixtures for edge cases
  const fixtures = await generator.generateEdgeCaseTests(
    edgeCases.map(ec => ec.directive)
  );
  
  // Generate test code
  const testCode = fixtures.map(fixture =>
    testCodeGenerator.generateEdgeCaseTest(fixture, config.framework)
  );
  
  // Write test files
  await writeTestFiles(testCode, fixtures, config.outputDir);
  
  console.log(`Generated ${fixtures.length} edge case tests`);
}
```

### 4. Snapshot Test Generation

```typescript
async function generateSnapshotTests(config: TestConfig): Promise<void> {
  // Load directives for snapshot testing
  const directives = await loadSnapshotDirectives(config.snapshotDir);
  
  // Generate snapshots
  const snapshots = await Promise.all(
    directives.map(async directive => {
      return generator.generateSnapshot(
        directive.directive,
        directive.name
      );
    })
  );
  
  // Write snapshot files
  await writeSnapshotFiles(snapshots, config.snapshotOutputDir);
  
  // Generate snapshot test code
  const testCode = snapshots.map(snapshot =>
    testCodeGenerator.generateSnapshotTest(snapshot, config.framework)
  );
  
  // Write test files
  await writeTestFiles(testCode, snapshots, config.outputDir);
  
  console.log(`Generated ${snapshots.length} snapshot tests`);
}
```

## Test Framework Integration

The test generation system integrates with popular testing frameworks:

### 1. Jest Integration

```typescript
function generateJestTest(fixture: DirectiveFixture): string {
  return `
describe('${fixture.name}', () => {
  test('${fixture.description}', () => {
    const directive = \`${fixture.directive.replace(/`/g, '\\`')}\`;
    
    const ast = parseDirective(directive);
    
    // Test basic structure
    expect(ast.kind).toBe('${fixture.expected.kind}');
    expect(ast.subtype).toBe('${fixture.expected.subtype}');
    
    // Test specific properties using snapshot
    expect(ast).toMatchSnapshot();
  });
});
`;
}

function generateJestParameterizedTest(testCase: ParameterizedTestCase): string {
  const parameterCombinations = generateCombinations(testCase.parameters);
  
  let testCode = `
describe('${testCase.name}', () => {
`;

  parameterCombinations.forEach((params, index) => {
    const paramStr = Object.entries(params)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ');
    
    // Generate directive by replacing params in template
    let directive = testCase.template;
    Object.entries(params).forEach(([key, value]) => {
      directive = directive.replace(`{${key}}`, value as string);
    });
    
    testCode += `
  test('Variation ${index + 1}: ${paramStr}', () => {
    const directive = \`${directive.replace(/`/g, '\\`')}\`;
    
    const ast = parseDirective(directive);
    
    // Test basic structure
    expect(ast.kind).toBe('${testCase.expectedTemplate.kind}');
    expect(ast.subtype).toBe('${testCase.expectedTemplate.subtype}');
    
    // Test specific properties
    ${generateExpectationsForParams(testCase.expectedTemplate, params)}
  });
`;
  });
  
  testCode += `});`;
  
  return testCode;
}

function generateJestSnapshotTest(snapshot: ASTSnapshot): string {
  return `
describe('${snapshot.name} (Snapshot)', () => {
  test('AST structure should match snapshot', () => {
    const directive = \`${snapshot.directive.replace(/`/g, '\\`')}\`;
    
    const ast = parseDirective(directive);
    
    expect(ast).toMatchSnapshot();
  });
});
`;
}
```

### 2. Vitest Integration

```typescript
function generateVitestTest(fixture: DirectiveFixture): string {
  return `
import { describe, it, expect } from 'vitest';
import { parseDirective } from '../src/parser';

describe('${fixture.name}', () => {
  it('${fixture.description}', () => {
    const directive = \`${fixture.directive.replace(/`/g, '\\`')}\`;
    
    const ast = parseDirective(directive);
    
    // Test basic structure
    expect(ast.kind).toBe('${fixture.expected.kind}');
    expect(ast.subtype).toBe('${fixture.expected.subtype}');
    
    // Test specific properties using snapshot
    expect(ast).toMatchSnapshot();
  });
});
`;
}

function generateVitestParameterizedTest(testCase: ParameterizedTestCase): string {
  const parameterCombinations = generateCombinations(testCase.parameters);
  
  let testCode = `
import { describe, it, expect } from 'vitest';
import { parseDirective } from '../src/parser';

describe('${testCase.name}', () => {
`;

  parameterCombinations.forEach((params, index) => {
    const paramStr = Object.entries(params)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ');
    
    // Generate directive by replacing params in template
    let directive = testCase.template;
    Object.entries(params).forEach(([key, value]) => {
      directive = directive.replace(`{${key}}`, value as string);
    });
    
    testCode += `
  it('Variation ${index + 1}: ${paramStr}', () => {
    const directive = \`${directive.replace(/`/g, '\\`')}\`;
    
    const ast = parseDirective(directive);
    
    // Test basic structure
    expect(ast.kind).toBe('${testCase.expectedTemplate.kind}');
    expect(ast.subtype).toBe('${testCase.expectedTemplate.subtype}');
    
    // Test specific properties
    ${generateExpectationsForParams(testCase.expectedTemplate, params)}
  });
`;
  });
  
  testCode += `});`;
  
  return testCode;
}
```

### 3. Comprehensive Test Suite Generation

```typescript
async function generateComprehensiveTestSuite(config: TestConfig): Promise<void> {
  // Generate index file for the test suite
  const indexCode = `
// Auto-generated test suite for ${config.name}
// Generated on: ${new Date().toISOString()}
// Grammar version: ${config.version}

${config.framework === 'jest' ? 
  "import { parseDirective } from '../src/parser';" :
  "import { describe, it, expect } from 'vitest';\nimport { parseDirective } from '../src/parser';"}

// Import all test modules
${generateTestImports(config)}

// Run tests
`;

  await writeTestFile(
    indexCode,
    `index.test.${config.extension}`,
    config.outputDir
  );
  
  // Generate basic tests
  await generateBasicTests(config);
  
  // Generate parameterized tests
  await generateParameterizedTests(config);
  
  // Generate edge case tests
  await generateEdgeCaseTests(config);
  
  // Generate snapshot tests
  await generateSnapshotTests(config);
  
  console.log(`Generated comprehensive test suite in ${config.outputDir}`);
}
```

## Integration with Development Workflow

The test generation system integrates with the development workflow:

### 1. Watch Mode for Test Generation

```typescript
async function watchTests(config: TestConfig): Promise<void> {
  const watcher = chokidar.watch([
    config.examplesDir,
    config.parameterizedDir,
    config.edgeCasesDir,
    config.grammarDir
  ], {
    persistent: true
  });
  
  watcher.on('change', async (path) => {
    console.log(`File changed: ${path}`);
    
    // Determine what to update
    if (path.startsWith(config.examplesDir)) {
      await generateBasicTests(config);
    } else if (path.startsWith(config.parameterizedDir)) {
      await generateParameterizedTests(config);
    } else if (path.startsWith(config.edgeCasesDir)) {
      await generateEdgeCaseTests(config);
    } else if (path.startsWith(config.grammarDir)) {
      // Regenerate all tests for grammar changes
      await generateComprehensiveTestSuite(config);
    }
  });
  
  console.log('Watching for test changes...');
}
```

### 2. Test Snapshot Management

```typescript
async function manageSnapshots(config: TestConfig): Promise<void> {
  // Load existing snapshots
  const existingSnapshots = await loadExistingSnapshots(config.snapshotOutputDir);
  
  // Load directives for snapshot testing
  const directives = await loadSnapshotDirectives(config.snapshotDir);
  
  // Generate new snapshots
  const newSnapshots = await Promise.all(
    directives.map(async directive => {
      return generator.generateSnapshot(
        directive.directive,
        directive.name
      );
    })
  );
  
  // Compare snapshots
  const snapshotChanges = compareSnapshots(existingSnapshots, newSnapshots);
  
  if (snapshotChanges.changed.length > 0) {
    console.log(`Detected ${snapshotChanges.changed.length} snapshot changes:`);
    
    for (const change of snapshotChanges.changed) {
      console.log(`- ${change.name}:`);
      console.log(`  ${JSON.stringify(change.diff)}`);
    }
    
    if (config.autoUpdateSnapshots) {
      await writeSnapshotFiles(newSnapshots, config.snapshotOutputDir);
      console.log(`Updated ${snapshotChanges.changed.length} snapshots`);
    } else {
      console.log('To update snapshots, run with --updateSnapshots flag');
    }
  } else {
    console.log('All snapshots are up to date');
  }
}
```

### 3. CI/CD Integration

```yaml
# GitHub Action for test generation
name: Generate Tests

on:
  push:
    paths:
      - 'grammar/**'
      - 'tests/fixtures/**'
      - 'tests/examples/**'

jobs:
  tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm ci
      - name: Generate Tests
        run: npm run generate-tests
      - name: Check for changes
        id: changes
        run: |
          git diff --exit-code || echo "::set-output name=changed::true"
      - name: Commit changes if tests were updated
        if: steps.changes.outputs.changed == 'true'
        uses: stefanzweifel/git-auto-commit-action@v4
        with:
          commit_message: "chore: Update generated tests [skip ci]"
          commit_user_name: "GitHub Actions"
          commit_user_email: "actions@github.com"
          commit_author: "GitHub Actions <actions@github.com>"
          file_pattern: "tests/**/*"
```

## Test Coverage Analysis

The system includes test coverage analysis for grammar features:

### 1. Directive Coverage Analysis

```typescript
interface DirectiveCoverage {
  kind: string;
  subtypes: Array<{
    name: string;
    covered: boolean;
    testCount: number;
    tests: string[];
  }>;
  totalSubtypes: number;
  coveredSubtypes: number;
  coverage: number; // Percentage
}

async function analyzeDirectiveCoverage(config: TestConfig): Promise<DirectiveCoverage[]> {
  // Get all possible directive kinds and subtypes
  const allDirectives = await getDirectiveMetadata(config.grammarDir);
  
  // Get all existing tests
  const existingTests = await getAllTests(config.outputDir);
  
  // Analyze coverage for each directive kind
  const coverage = allDirectives.map(directive => {
    const subtypeCoverage = directive.subtypes.map(subtype => {
      const tests = existingTests.filter(test => 
        test.kind === directive.kind && test.subtype === subtype.name
      );
      
      return {
        name: subtype.name,
        covered: tests.length > 0,
        testCount: tests.length,
        tests: tests.map(t => t.name)
      };
    });
    
    const coveredSubtypes = subtypeCoverage.filter(s => s.covered).length;
    
    return {
      kind: directive.kind,
      subtypes: subtypeCoverage,
      totalSubtypes: directive.subtypes.length,
      coveredSubtypes,
      coverage: (coveredSubtypes / directive.subtypes.length) * 100
    };
  });
  
  return coverage;
}
```

### 2. Feature Coverage Analysis

```typescript
interface FeatureCoverage {
  feature: string;
  tested: boolean;
  testCount: number;
  tests: string[];
}

async function analyzeFeatureCoverage(config: TestConfig): Promise<FeatureCoverage[]> {
  // Get all grammar features
  const allFeatures = await getGrammarFeatures(config.grammarDir);
  
  // Get all existing tests
  const existingTests = await getAllTests(config.outputDir);
  
  // Analyze coverage for each feature
  const coverage = allFeatures.map(feature => {
    const tests = existingTests.filter(test => 
      test.features.includes(feature.name)
    );
    
    return {
      feature: feature.name,
      tested: tests.length > 0,
      testCount: tests.length,
      tests: tests.map(t => t.name)
    };
  });
  
  return coverage;
}
```

### 3. Coverage Report Generation

```typescript
async function generateCoverageReport(config: TestConfig): Promise<void> {
  // Analyze directive coverage
  const directiveCoverage = await analyzeDirectiveCoverage(config);
  
  // Analyze feature coverage
  const featureCoverage = await analyzeFeatureCoverage(config);
  
  // Calculate overall statistics
  const totalDirectives = directiveCoverage.length;
  const coveredDirectives = directiveCoverage.filter(d => d.coverage > 0).length;
  const totalSubtypes = directiveCoverage.reduce((sum, d) => sum + d.totalSubtypes, 0);
  const coveredSubtypes = directiveCoverage.reduce((sum, d) => sum + d.coveredSubtypes, 0);
  
  const totalFeatures = featureCoverage.length;
  const coveredFeatures = featureCoverage.filter(f => f.tested).length;
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    version: config.version,
    summary: {
      directives: {
        total: totalDirectives,
        covered: coveredDirectives,
        coverage: (coveredDirectives / totalDirectives) * 100
      },
      subtypes: {
        total: totalSubtypes,
        covered: coveredSubtypes,
        coverage: (coveredSubtypes / totalSubtypes) * 100
      },
      features: {
        total: totalFeatures,
        covered: coveredFeatures,
        coverage: (coveredFeatures / totalFeatures) * 100
      }
    },
    directives: directiveCoverage,
    features: featureCoverage
  };
  
  // Write JSON report
  await fs.writeFile(
    path.join(config.reportDir, 'coverage.json'),
    JSON.stringify(report, null, 2)
  );
  
  // Generate HTML report
  const htmlReport = generateHtmlCoverageReport(report);
  await fs.writeFile(
    path.join(config.reportDir, 'coverage.html'),
    htmlReport
  );
  
  console.log(`Generated coverage report in ${config.reportDir}`);
  console.log(`Directive coverage: ${report.summary.directives.coverage.toFixed(2)}%`);
  console.log(`Subtype coverage: ${report.summary.subtypes.coverage.toFixed(2)}%`);
  console.log(`Feature coverage: ${report.summary.features.coverage.toFixed(2)}%`);
}
```

## Benefits of This Approach

The integrated test generation system provides several key benefits:

1. **Complete Coverage**: Every directive and feature has comprehensive tests
2. **Consistency**: All tests follow the same patterns and conventions
3. **Maintainability**: Tests update automatically with grammar changes
4. **Early Detection**: AST changes are immediately visible and testable
5. **Confidence**: High test coverage ensures grammar works as expected
6. **Development Speed**: Automated test generation accelerates development

## Future Enhancements

Potential future enhancements to the test generation system:

1. **Property-Based Testing**:
   - Generate random valid directives based on grammar rules
   - Automatically explore edge cases
   - Fuzz testing for error conditions

2. **Performance Testing**:
   - Generate test cases for performance benchmarks
   - Detect performance regressions
   - Test memory usage patterns

3. **Integration Testing**:
   - Generate integration test scenarios
   - Test directive combinations
   - Test complete document parsing

4. **Mutation Testing**:
   - Automatically modify grammar to test test quality
   - Identify untested aspects of the implementation
   - Improve test precision

## Conclusion

The test fixture generation system forms a crucial part of our grammar-driven development approach. By automatically generating comprehensive, accurate test fixtures directly from our grammar, we ensure complete test coverage and rapid feedback during development.

This approach significantly reduces test maintenance burden while improving quality, consistency, and coverage, ultimately leading to a more robust and reliable grammar implementation.