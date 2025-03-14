import { SchemaDefinition } from '@core/syntax/types/schema.js';

/**
 * HTTP methods supported by API endpoints
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * API endpoint configuration
 */
export interface APIEndpoint {
  path: string;
  methods: HTTPMethod[];
  parameters?: {
    query?: Record<string, SchemaDefinition>;
    body?: SchemaDefinition;
    headers?: Record<string, SchemaDefinition>;
  };
  responses?: Record<number, {
    schema: SchemaDefinition;
    description?: string;
  }>;
}

/**
 * API configuration
 */
export interface APIConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  endpoints?: Record<string, APIEndpoint>;
  auth?: {
    type: 'basic' | 'bearer' | 'oauth2';
    credentials?: {
      username?: string;
      password?: string;
      token?: string;
    };
  };
}

/**
 * API call result
 */
export interface APICallResult {
  status: number;
  headers: Record<string, string>;
  data: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
} 