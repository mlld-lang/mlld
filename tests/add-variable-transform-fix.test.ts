import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from '@api/index';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import type { Services } from '@core/types/index';
import type { DirectiveNode } from '@core/syntax/types';
import { OutputService } from '@services/pipeline/OutputService/OutputService';
import { outputLogger } from '@core/utils/logger';
import type { IStateService } from '@services/state/StateService/IStateService';

/**
 * Implementation of variable resolution for add directives
 * This function contains the core logic for the Phase 4B fix
 */
async function resolveVariableBasedEmbed(
  directive: DirectiveNode, 
  state: IStateService
): Promise<string> {
  try {
    if (!directive.directive.path || 
        typeof directive.directive.path !== 'object' || 
        !directive.directive.path.isVariableReference) {
      return '';
    }
    
    // Extract variable name and field path
    const varName = directive.directive.path.identifier;
    let fieldPath = '';
    
    // Build field path from fields array
    if (directive.directive.path.fields && Array.isArray(directive.directive.path.fields)) {
      fieldPath = directive.directive.path.fields
        .map(field => {
          if (field.type === 'field' || field.type === 'index') {
            return String(field.value);
          }
          return '';
        })
        .filter(Boolean)
        .join('.');
    }
    
    outputLogger.debug('Resolving variable reference for add directive', {
      varName,
      fieldPath
    });
    
    // Resolve the variable value
    let value;
    
    // Try data variable first (most common for field access)
    value = state.getDataVar(varName);
    outputLogger.debug('Looking up data variable', { varName, found: value !== undefined });
    
    // If not found as data variable, try text variable
    if (value === undefined) {
      value = state.getTextVar(varName);
      outputLogger.debug('Looking up text variable', { varName, found: value !== undefined });
    }
    
    // If not found as text variable, try path variable
    if (value === undefined && state.getPathVar) {
      value = state.getPathVar(varName);
      outputLogger.debug('Looking up path variable', { varName, found: value !== undefined });
    }
    
    if (value === undefined) {
      outputLogger.warn('Variable not found', { varName });
      return '';
    }
    
    // Process field access if needed
    if (fieldPath) {
      try {
        // Navigate through the object/array using the field path
        const fields = fieldPath.split('.');
        let current = value;
        
        for (const field of fields) {
          // Handle array indices
          if (/^\d+$/.test(field) && Array.isArray(current)) {
            const index = parseInt(field, 10);
            if (index >= 0 && index < current.length) {
              current = current[index];
            } else {
              outputLogger.warn('Array index out of bounds', { index, array: current });
              return '';
            }
          } 
          // Handle object properties
          else if (typeof current === 'object' && current !== null) {
            if (field in current) {
              current = current[field];
            } else {
              outputLogger.warn('Field not found in object', { field, object: current });
              return '';
            }
          } 
          // Cannot access field on non-object types
          else {
            outputLogger.warn('Cannot access field on non-object', { field, value: current });
            return '';
          }
        }
        
        // Set value to the extracted field value
        value = current;
        outputLogger.debug('Extracted field value', { varName, fieldPath, value });
      } catch (error) {
        outputLogger.error('Error accessing field', {
          varName,
          fieldPath,
          error: error instanceof Error ? error.message : String(error)
        });
        return '';
      }
    }
    
    // Convert the value to a string based on its type
    if (value === undefined || value === null) {
      return '';
    } else if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    } else if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch (error) {
        outputLogger.error('Error stringifying object', { error });
        return '[Object]';
      }
    } else {
      return String(value);
    }
  } catch (error) {
    outputLogger.error('Error resolving variable-based add', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return '';
  }
}

describe('Phase 4B: Variable-based Add Transformation Fix', () => {
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.create();
    await context.initialize();
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  it('should properly resolve variable field access in add directives with transformation', async () => {
    // Create a test file with a simple data variable and add directive
    const testFilePath = 'field-access-add.meld';
    await context.services.filesystem.writeFile(testFilePath, 
      '@data role = { "architect": "Senior architect" }\n@add {{role.architect}}'
    );
    
    // Process the file with transformation enabled
    const transformedResult = await main(testFilePath, {
      fs: context.services.filesystem,
      transformation: true,
      format: 'md'
    });
    
    // Log the actual output for debugging
    console.log('Transformed output:', transformedResult);
    
    // Verify that the variable's field value is correctly embedded in the output
    // This tests the fix for field access in variable embeds
    expect(transformedResult).toContain('Senior architect');
    
    // Verify the variable reference has been properly transformed
    expect(transformedResult).not.toContain('{{role.architect}}');
  });
  
  it('should support complex field access patterns in variable embeds', async () => {
    // Create a complex test case with nested objects and array access patterns
    const testFilePath = 'complex-access.meld';
    await context.services.filesystem.writeFile(testFilePath, `
@data user = {
  "info": {
    "name": "John Doe",
    "roles": ["Developer", "Architect", "Manager"],
    "contact": {
      "email": "john@example.com",
      "phone": "555-1234"
    }
  },
  "projects": [
    { "name": "Project A", "role": "Lead" },
    { "name": "Project B", "role": "Contributor" }
  ]
}

# User Data
Name: @add {{user.info.name}}
Primary Role: @add {{user.info.roles.0}}
Email: @add {{user.info.contact.email}}
First Project: @add {{user.projects.0.name}}
Project Role: @add {{user.projects.0.role}}
`);
    
    // Process the file with transformation disabled first to verify original formatting
    const standardResult = await main(testFilePath, {
      fs: context.services.filesystem,
      format: 'md' // Transformation disabled
    });
    
    // Verify original format has add directives
    expect(standardResult).toContain('@add');
    
    // Process with transformation enabled 
    const transformedResult = await main(testFilePath, {
      fs: context.services.filesystem,
      transformation: true,
      format: 'md'
    });
    
    // Log the actual output for debugging
    console.log('Complex transformation output:', transformedResult);
    
    // Check for properly resolved values without assuming specific formatting
    
    // 1. Simple object property access
    expect(transformedResult).toContain('John Doe');
    
    // 2. Array indexing
    expect(transformedResult).toContain('Developer');
    
    // 3. Nested property access
    expect(transformedResult).toContain('john@example.com');
    
    // 4. Complex nested structure with array and object access
    expect(transformedResult).toContain('Project A');
    expect(transformedResult).toContain('Lead');
    
    // Verify variable references are transformed (regardless of directive format)
    expect(transformedResult).not.toContain('{{user.info.name}}');
    expect(transformedResult).not.toContain('{{user.info.roles.0}}');
    expect(transformedResult).not.toContain('{{user.projects.0.name}}');
    
    // This test verifies the issue is fixed - the values are properly being resolved
    // The exact formatting may vary in different implementations
  });
});