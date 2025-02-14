// Mock implementation of meld-spec core types
export interface Position {
  line: number;   // 1-based
  column: number; // 1-based
}

export interface Location {
  start: Position;
  end: Position;
  filePath?: string;
}

export interface MeldNode {
  type: string;
  content?: string;
  directive?: {
    kind: string;
    name?: string;
    value?: string;
    [key: string]: any;
  };
  location?: Location;
}

export interface TextVariable {
  type: 'text';
  name: string;
  value: string;
}

export interface DataVariable {
  type: 'data';
  name: string;
  value: any;
}

export interface PathVariable {
  type: 'path';
  name: string;
  value: string;
}

export interface CommandDefinition {
  name: string;
  parameters?: string[];
  body: string;
  metadata?: {
    risk?: string;
    about?: string;
    meta?: any;
  };
}

export interface ValidationError {
  message: string;
  code: string;
  location?: Location;
}

export interface ValidationContext {
  filePath?: string;
  baseDir?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface Parser {
  parse(content: string): MeldNode[];
} 