/**
 * Test fixture generation utilities
 */
import * as path from 'path';
import type { DirectiveNode } from '../parse.js';
import type { IFileSystemAdapter } from '../explorer.js';
import { nodeFsAdapter } from '../fs-adapter.js';

/**
 * Generate a test fixture for a directive
 */
export function generateTestFixture(
  directive: string,
  node: DirectiveNode,
  name: string,
  framework: 'vitest' | 'jest' = 'vitest'
): string {
  return framework === 'vitest'
    ? generateVitestFixture(directive, node, name)
    : generateJestFixture(directive, node, name);
}

/**
 * Generate a Vitest test fixture
 */
function generateVitestFixture(directive: string, node: DirectiveNode, name: string): string {
  // Generate test file content
  return `
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';

describe('${name} directive', () => {
  it('should parse correctly', () => {
    const directive = \`${escapeString(directive)}\`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('${node.type}');
    expect(result.kind).toBe('${node.kind}');
    expect(result.subtype).toBe('${node.subtype}');

    // Test values object structure
    ${generateValueTests(node)}

    // Full AST comparison
    expect(result).toMatchObject(${JSON.stringify(node, null, 2)});
  });
});
`;
}

/**
 * Generate a Jest test fixture
 */
function generateJestFixture(directive: string, node: DirectiveNode, name: string): string {
  // Generate test file content similar to Vitest but with Jest syntax
  return `
import { parse } from '@core/ast/grammar/parser';

describe('${name} directive', () => {
  test('should parse correctly', () => {
    const directive = \`${escapeString(directive)}\`;

    const result = parse(directive)[0];

    // Test key properties
    expect(result.type).toBe('${node.type}');
    expect(result.kind).toBe('${node.kind}');
    expect(result.subtype).toBe('${node.subtype}');

    // Test values object structure
    ${generateValueTests(node)}

    // Full AST comparison
    expect(result).toMatchObject(${JSON.stringify(node, null, 2)});
  });
});
`;
}

/**
 * Generate tests for the values object
 */
function generateValueTests(node: DirectiveNode): string {
  const tests: string[] = [];

  // Check values object properties
  for (const key of Object.keys(node.values || {})) {
    tests.push(`expect(result.values).toHaveProperty('${key}');`);
  }

  // Check raw object properties
  for (const key of Object.keys(node.raw || {})) {
    tests.push(`expect(result.raw).toHaveProperty('${key}');`);
  }

  return tests.join('\n    ');
}

/**
 * Write test fixture to file
 */
export function writeTestFixture(
  fixtureContent: string,
  name: string,
  outputDir: string,
  fileSystem?: IFileSystemAdapter
): string {
  // Use provided fileSystem or fallback to fs
  const fsAdapter = fileSystem || nodeFsAdapter;

  // Ensure output directory exists
  fsAdapter.mkdirSync(outputDir, { recursive: true });

  // Create fixture file path
  const fixturePath = path.join(outputDir, `${name}.test.ts`);

  // Write fixture to file
  fsAdapter.writeFileSync(fixturePath, fixtureContent);

  return fixturePath;
}

/**
 * Escape special characters in a string for template literals
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${');
}