import { Environment } from '@interpreter/env/Environment';
import { SourceLocation } from '@core/types/astTypes';
import type { SecurityDescriptor } from '@core/types/security';

async function interpolateAndRecord(nodes: any, env: Environment): Promise<string> {
  const { interpolate } = await import('@interpreter/core/interpreter');
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, undefined, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1 ? descriptors[0] : env.mergeSecurityDescriptors(...descriptors);
    env.recordSecurityDescriptor(merged);
  }
  return text;
}

export interface ArrayNode {
  type: 'array';
  items: any[];
  location: SourceLocation | { synthetic: boolean };
}

export interface ObjectNode {
  type: 'object';
  properties: Record<string, any>;
  location: SourceLocation | { synthetic: boolean };
}

export class ASTEvaluator {
  /**
   * Normalize an array value to have consistent type information
   */
  static normalizeArray(value: any): ArrayNode {
    // Already normalized
    if (value && typeof value === 'object' && value.type === 'array') {
      return value;
    }
    
    // Plain JavaScript array - synthesize type information
    if (Array.isArray(value)) {
      return {
        type: 'array',
        items: value.map(item => this.normalizeValue(item)),
        location: { synthetic: true }
      };
    }
    
    throw new Error(`Expected array, got ${typeof value}`);
  }
  
  /**
   * Normalize an object value to have consistent type information
   */
  static normalizeObject(value: any): ObjectNode {
    // Already normalized
    if (value && typeof value === 'object' && value.type === 'object') {
      return value;
    }
    
    // Plain JavaScript object - synthesize type information
    if (typeof value === 'object' && value !== null && value.constructor === Object) {
      const properties: Record<string, any> = {};
      
      for (const [key, val] of Object.entries(value)) {
        // Skip internal properties
        if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
          continue;
        }
        properties[key] = this.normalizeValue(val);
      }
      
      return {
        type: 'object',
        properties,
        location: { synthetic: true }
      };
    }
    
    throw new Error(`Expected object, got ${typeof value}`);
  }
  
  /**
   * Normalize any value - Phase 2: Extended for objects
   */
  static normalizeValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    
    // Handle wrapped content first (e.g., quoted strings)
    if (value && typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
      // Extract the string content from wrapped strings
      if (value.content.length > 0 && value.content[0].type === 'Text') {
        return value.content[0].content;
      }
      // Handle empty content
      if (value.content.length === 0) {
        return '';
      }
      // For complex content, might need interpolation - return as is for now
      return value;
    }
    
    // Handle raw Text nodes
    if (value && typeof value === 'object' && value.type === 'Text' && 'content' in value) {
      return value.content;
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return this.normalizeArray(value);
    }
    
    // Handle objects (but not already-typed nodes)
    if (typeof value === 'object' && value !== null && value.constructor === Object && !value.type) {
      return this.normalizeObject(value);
    }
    
    // Already-typed nodes and primitives pass through
    return value;
  }
  
  /**
   * Evaluate a value to runtime representation
   * Phase 2: Extended for objects and arrays
   */
  static async evaluateToRuntime(value: any, env: Environment): Promise<any> {
    if (value === null || value === undefined) {
      return value;
    }
    
    // Normalize the value first
    const normalized = this.normalizeValue(value);
    
    // Handle normalized arrays
    if (normalized && normalized.type === 'array') {
      const evaluatedItems = [];
      
      for (const item of normalized.items) {
        // Recursively evaluate each item
        evaluatedItems.push(await this.evaluateToRuntime(item, env));
      }
      
      return evaluatedItems;
    }
    
    // Handle normalized objects
    if (normalized && normalized.type === 'object') {
      const evaluatedObject: Record<string, any> = {};
      
      for (const [key, val] of Object.entries(normalized.properties)) {
        // Recursively evaluate each property
        evaluatedObject[key] = await this.evaluateToRuntime(val, env);
      }
      
      return evaluatedObject;
    }
    
    // Handle wrapped content that wasn't normalized (complex interpolation needed)
    if (normalized && typeof normalized === 'object' && 'wrapperType' in normalized && 'content' in normalized) {
      return await interpolateAndRecord(normalized.content, env);
    }
    
    // Primitives and other values
    return normalized;
  }
}
