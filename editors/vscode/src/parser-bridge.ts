import * as path from 'path';
import { parse } from '../../../grammar/parser';
import type { DirectiveNode, MlldNode } from '../../../core/types';

export interface ParseResult {
  ast: MlldNode[];
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
}

/**
 * Parse a Mlld document using the actual Mlld parser
 */
export async function parseDocument(text: string): Promise<ParseResult> {
  try {
    // The parser returns an array of nodes
    const ast = parse(text);
    return { ast, errors: [] };
  } catch (error: any) {
    // Extract error information from parser exception
    const parseError: ParseError = {
      message: error.message || 'Unknown parse error',
      line: error.location?.start?.line || 1,
      column: error.location?.start?.column || 1,
      offset: error.location?.start?.offset || 0
    };
    
    return { ast: [], errors: [parseError] };
  }
}

/**
 * Extract all variable definitions from the AST
 */
export function extractVariables(ast: MlldNode[]): VariableInfo[] {
  const variables: VariableInfo[] = [];
  
  for (const node of ast) {
    if (node.type === 'Directive') {
      const directive = node as DirectiveNode;
      
      switch (directive.subtype) {
        case 'TextAssignment':
        case 'DataAssignment':
        case 'PathAssignment':
        case 'ExecCode':
        case 'ExecCommand':
        case 'RunCode':
        case 'RunCommand':
          if (directive.variable) {
            variables.push({
              name: directive.variable.value,
              kind: getVariableKind(directive.subtype),
              location: {
                line: directive.position.start.line,
                column: directive.position.start.column,
                offset: directive.position.start.offset
              },
              directive: directive
            });
          }
          break;
      }
    }
  }
  
  return variables;
}

/**
 * Extract imports from the AST
 */
export function extractImports(ast: MlldNode[]): ImportInfo[] {
  const imports: ImportInfo[] = [];
  
  for (const node of ast) {
    if (node.type === 'Directive') {
      const directive = node as DirectiveNode;
      
      if (directive.subtype === 'ImportAll' || directive.subtype === 'ImportSelected') {
        imports.push({
          type: directive.subtype === 'ImportAll' ? 'all' : 'selected',
          path: getImportPath(directive),
          variables: directive.subtype === 'ImportSelected' ? getImportedVariables(directive) : ['*'],
          location: {
            line: directive.position.start.line,
            column: directive.position.start.column,
            offset: directive.position.start.offset
          }
        });
      }
    }
  }
  
  return imports;
}

/**
 * Find all references to a variable in the AST
 */
export function findVariableReferences(ast: MlldNode[], variableName: string): LocationInfo[] {
  const references: LocationInfo[] = [];
  
  function visitNode(node: any) {
    // Check for variable references in different contexts
    if (node.type === 'Variable' && node.value === variableName) {
      references.push({
        line: node.position.start.line,
        column: node.position.start.column,
        offset: node.position.start.offset
      });
    }
    
    // Check template interpolations
    if (node.type === 'TemplateInterpolation' && node.variable === variableName) {
      references.push({
        line: node.position.start.line,
        column: node.position.start.column,
        offset: node.position.start.offset
      });
    }
    
    // Recursively visit child nodes
    for (const key in node) {
      const value = node[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach(visitNode);
        } else if (value.type) {
          visitNode(value);
        }
      }
    }
  }
  
  ast.forEach(visitNode);
  return references;
}

// Helper types and functions

export interface VariableInfo {
  name: string;
  kind: VariableKind;
  location: LocationInfo;
  directive: DirectiveNode;
}

export interface ImportInfo {
  type: 'all' | 'selected';
  path: string;
  variables: string[];
  location: LocationInfo;
}

export interface LocationInfo {
  line: number;
  column: number;
  offset: number;
}

export type VariableKind = 'text' | 'data' | 'path' | 'exec' | 'run';

function getVariableKind(subtype: string): VariableKind {
  switch (subtype) {
    case 'TextAssignment':
      return 'text';
    case 'DataAssignment':
      return 'data';
    case 'PathAssignment':
      return 'path';
    case 'ExecCode':
    case 'ExecCommand':
      return 'exec';
    case 'RunCode':
    case 'RunCommand':
      return 'run';
    default:
      return 'text';
  }
}

function getImportPath(directive: DirectiveNode): string {
  // Extract path from import directive
  // This depends on the exact AST structure
  const pathNode = (directive as any).path;
  return pathNode?.value || '';
}

function getImportedVariables(directive: DirectiveNode): string[] {
  // Extract imported variable names from ImportSelected directive
  const imports = (directive as any).imports;
  if (Array.isArray(imports)) {
    return imports.map((imp: any) => imp.value || imp);
  }
  return [];
}