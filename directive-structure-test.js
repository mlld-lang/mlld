// Create this as a test file we can run with vitest
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/parser';

// Helper function to log directive structure
function logDirectiveStructure(directive) {
  console.log('Type:', directive.type);
  console.log('Kind:', directive.kind);
  console.log('Subtype:', directive.subtype);
  
  // Log details about the values object
  console.log('\nValues object keys:');
  for (const key in directive.values) {
    const value = directive.values[key];
    const isArray = Array.isArray(value);
    const type = isArray ? `Array[${value.length}]` : typeof value;
    
    console.log(`- ${key}: ${type}`);
    
    if (isArray) {
      value.forEach((item, index) => {
        console.log(`  [${index}]: Type = ${item.type || typeof item}`);
      });
    } else if (typeof value === 'object' && value !== null) {
      console.log(`  Type = ${value.type || '(no type property)'}`);
    }
  }
}

// Test each directive structure
describe('Directive Structure Analysis', () => {
  it('should show import directive structure', async () => {
    const input = '@import { * } from "file.md"';
    const { ast } = await parse(input);
    console.log('\n==== IMPORT DIRECTIVE STRUCTURE ====');
    logDirectiveStructure(ast[0]);
    expect(ast.length).toBeGreaterThan(0);
  });
  
  it('should show add directive structure', async () => {
    const input = '@add "path/to/file.md"';
    const { ast } = await parse(input);
    console.log('\n==== ADD DIRECTIVE STRUCTURE ====');
    logDirectiveStructure(ast[0]);
    expect(ast.length).toBeGreaterThan(0);
  });
  
  it('should show text directive structure', async () => {
    const input = '@text myvar = "some text"';
    const { ast } = await parse(input);
    console.log('\n==== TEXT DIRECTIVE STRUCTURE ====');
    logDirectiveStructure(ast[0]);
    expect(ast.length).toBeGreaterThan(0);
  });
  
  it('should show data directive structure', async () => {
    const input = '@data myvar = { "key": "value" }';
    const { ast } = await parse(input);
    console.log('\n==== DATA DIRECTIVE STRUCTURE ====');
    logDirectiveStructure(ast[0]);
    expect(ast.length).toBeGreaterThan(0);
  });
  
  it('should show path directive structure', async () => {
    const input = '@path myvar = "/path/to/file"';
    const { ast } = await parse(input);
    console.log('\n==== PATH DIRECTIVE STRUCTURE ====');
    logDirectiveStructure(ast[0]);
    expect(ast.length).toBeGreaterThan(0);
  });
  
  it('should show run directive structure', async () => {
    const input = '@run [echo "hello world"]';
    const { ast } = await parse(input);
    console.log('\n==== RUN DIRECTIVE STRUCTURE ====');
    logDirectiveStructure(ast[0]);
    expect(ast.length).toBeGreaterThan(0);
  });
  
  it('should show exec directive structure', async () => {
    const input = '@exec mycommand (param) = @run [echo "hello"]';
    const { ast } = await parse(input);
    console.log('\n==== EXEC DIRECTIVE STRUCTURE ====');
    logDirectiveStructure(ast[0]);
    expect(ast.length).toBeGreaterThan(0);
  });
});