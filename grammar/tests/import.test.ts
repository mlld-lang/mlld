import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast';
import { importFixtures } from './fixtures/import';
import { parseDirective } from './utils/test-helpers';

describe('Import Directive AST Structure', () => {
  describe('New Values Object Structure', () => {
    for (const fixture of importFixtures) {
      it(`should parse ${fixture.name} with correct values object structure`, async () => {
        const node = await parseDirective(fixture.input);
        
        // Verify basic directive properties
        expect(node.type).toBe('Directive');
        expect(node.kind).toBe(fixture.expected.kind);
        expect(node.subtype).toBe(fixture.expected.subtype);
        
        // Verify the values object structure exists
        expect(node.values).toBeDefined();
        expect(typeof node.values).toBe('object');
        
        // Check that expected keys exist in values
        for (const key of Object.keys(fixture.expected.values)) {
          expect(node.values).toHaveProperty(key);
          expect(Array.isArray(node.values[key])).toBe(true);
        }
        
        // Sample check (specific nodes will be verified in implementation tests)
        if (node.values.imports) {
          expect(node.values.imports.length).toBeGreaterThan(0);
          expect(node.values.imports[0].type).toBe('VariableReference');
        }
        
        if (node.values.path) {
          expect(node.values.path.length).toBeGreaterThan(0);
        }
      });
    }
  });
  
  describe('Raw Values Property', () => {
    for (const fixture of importFixtures) {
      if (fixture.expected.raw) {
        it(`should include raw strings for ${fixture.name}`, async () => {
          const node = await parseDirective(fixture.input);
          
          // Verify raw property exists
          expect(node.raw).toBeDefined();
          expect(typeof node.raw).toBe('object');
          
          // Check that expected keys exist in raw with correct types
          for (const key of Object.keys(fixture.expected.raw!)) {
            expect(node.raw).toHaveProperty(key);
            expect(typeof node.raw[key]).toBe('string');
          }
        });
      }
    }
  });
  
  describe('Metadata Property', () => {
    for (const fixture of importFixtures) {
      if (fixture.expected.meta) {
        it(`should include metadata for ${fixture.name}`, async () => {
          const node = await parseDirective(fixture.input);
          
          // Verify meta property exists
          expect(node.meta).toBeDefined();
          expect(typeof node.meta).toBe('object');
          
          // Check that expected keys exist in meta
          for (const key of Object.keys(fixture.expected.meta!)) {
            expect(node.meta).toHaveProperty(key);
            // Type checking on meta values would be more complex
          }
        });
      }
    }
  });
});