/**
 * Basic schema types supported in Meld
 */
export type SchemaType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

/**
 * Schema definition for type validation
 */
export interface SchemaDefinition {
  type: SchemaType | SchemaType[];
  properties?: Record<string, SchemaDefinition>;
  items?: SchemaDefinition;  // For arrays
  enum?: any[];
  required?: string[];
  description?: string;
  default?: any;
  // Additional validations
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
}

/**
 * Schema reference in directives
 */
export interface SchemaReference {
  name: string;
  path?: string[];  // For nested schema references
}

/**
 * Built-in schema formats
 */
export const SCHEMA_FORMATS = {
  DATE: 'date',
  DATE_TIME: 'date-time',
  EMAIL: 'email',
  URI: 'uri',
  UUID: 'uuid'
} as const; 