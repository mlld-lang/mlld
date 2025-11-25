/**
 * Python Variable Helpers for Shadow Environments
 * Part of Phase 4: System-wide Variable Flow
 * 
 * Generates Python code to expose Variable metadata in shadow environments
 */

import type { Variable } from '@core/types/variable/VariableTypes';
import { isVariable } from '@interpreter/utils/variable-resolution';

/**
 * Generate Python code that defines mlld helper functions
 * @param primitiveMetadata - Optional metadata for primitive values
 */
export function generatePythonMlldHelpers(primitiveMetadata?: Record<string, any>): string {
  const metadataJson = primitiveMetadata ? JSON.stringify(primitiveMetadata) : '{}';
  
  return `
# mlld helper functions
class MlldHelpers:
    def __init__(self):
        self._primitive_metadata = ${metadataJson}
    
    def is_variable(self, value, name=None):
        """Check if a value has mlld Variable metadata"""
        # First check if it has attributes
        if hasattr(value, '__mlld_metadata__'):
            return True
        # Then check primitive metadata
        if name and name in self._primitive_metadata:
            return self._primitive_metadata[name].get('isVariable', False)
        return False
    
    def get_type(self, value, name=None):
        """Get the mlld type of a value"""
        if hasattr(value, '__mlld_type__'):
            return value.__mlld_type__
        # Check primitive metadata
        if name and name in self._primitive_metadata:
            return self._primitive_metadata[name].get('type')
        return None
    
    def get_subtype(self, value, name=None):
        """Get the mlld subtype of a value"""
        if hasattr(value, '__mlld_subtype__'):
            return value.__mlld_subtype__
        # Check primitive metadata
        if name and name in self._primitive_metadata:
            return self._primitive_metadata[name].get('subtype')
        return None
    
    def get_metadata(self, value, name=None):
        """Get the mlld metadata of a value"""
        if hasattr(value, '__mlld_metadata__'):
            return value.__mlld_metadata__
        # Check primitive metadata
        if name and name in self._primitive_metadata:
            return self._primitive_metadata[name].get('metadata', {})
        return {}

mlld = MlldHelpers()
`;
}

/**
 * Convert a Variable or value to Python code with metadata
 */
export function convertToPythonValue(value: any, varName: string): string {
  // Check if it's a Variable
  if (isVariable(value)) {
    const variable = value as Variable;
    return generatePythonVariable(variable, varName);
  }
  
  // Regular value - just JSON stringify
  return `${varName} = ${JSON.stringify(value)}`;
}

/**
 * Generate Python code for a Variable with metadata
 */
function generatePythonVariable(variable: Variable, varName: string): string {
  const value = variable.value;
  
  // For objects and arrays, we need to create a custom class
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return generatePythonArrayVariable(variable, varName);
    } else {
      return generatePythonObjectVariable(variable, varName);
    }
  }
  
  // For primitives, we can't add attributes, so we create a wrapper
  return generatePythonPrimitiveVariable(variable, varName);
}

/**
 * Generate Python code for an array Variable
 */
function generatePythonArrayVariable(variable: Variable, varName: string): string {
  const value = variable.value as any[];
  
  return `
class ${varName}_MlldArray(list):
    def __init__(self, items):
        super().__init__(items)
        self.__mlld_type__ = ${JSON.stringify(variable.type)}
        self.__mlld_subtype__ = ${JSON.stringify(variable.subtype || null)}
        self.__mlld_metadata__ = ${JSON.stringify({
            ctx: variable.ctx,
            internal: variable.internal
          })}
        self.__mlld_is_variable__ = True

${varName} = ${varName}_MlldArray(${JSON.stringify(value)})
`;
}

/**
 * Generate Python code for an object Variable
 */
function generatePythonObjectVariable(variable: Variable, varName: string): string {
  const value = variable.value as Record<string, any>;
  
  return `
class ${varName}_MlldObject(dict):
    def __init__(self, items):
        super().__init__(items)
        self.__mlld_type__ = ${JSON.stringify(variable.type)}
        self.__mlld_subtype__ = ${JSON.stringify(variable.subtype || null)}
        self.__mlld_metadata__ = ${JSON.stringify({
            ctx: variable.ctx,
            internal: variable.internal
          })}
        self.__mlld_is_variable__ = True
    
    def __getattr__(self, key):
        return self.get(key)

${varName} = ${varName}_MlldObject(${JSON.stringify(value)})
`;
}

/**
 * Generate Python code for a primitive Variable
 */
function generatePythonPrimitiveVariable(variable: Variable, varName: string): string {
  const value = variable.value;
  
  // For primitives, we create a wrapper class
  return `
class ${varName}_MlldValue:
    def __init__(self, value):
        self.value = value
        self.__mlld_type__ = ${JSON.stringify(variable.type)}
        self.__mlld_subtype__ = ${JSON.stringify(variable.subtype || null)}
        self.__mlld_metadata__ = ${JSON.stringify({
            ctx: variable.ctx,
            internal: variable.internal
          })}
        self.__mlld_is_variable__ = True
    
    def __str__(self):
        return str(self.value)
    
    def __repr__(self):
        return repr(self.value)
    
    # Delegate numeric operations to the value
    def __add__(self, other):
        return self.value + other
    def __sub__(self, other):
        return self.value - other
    def __mul__(self, other):
        return self.value * other
    def __truediv__(self, other):
        return self.value / other
    def __eq__(self, other):
        return self.value == other

${varName}_wrapper = ${varName}_MlldValue(${JSON.stringify(value)})
${varName} = ${varName}_wrapper.value  # Use the raw value by default
# But keep the wrapper available for type introspection
${varName}.__mlld_wrapper__ = ${varName}_wrapper
`;
}
