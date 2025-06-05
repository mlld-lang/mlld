const path = require('path');
const { parse } = require('../../../grammar/parser/parser.js');

/**
 * Parse a Mlld document using the actual Mlld parser
 * @param {string} text 
 * @returns {Promise<{ast: any[], errors: any[]}>}
 */
async function parseDocument(text) {
  try {
    // The parser returns an array of nodes
    const ast = parse(text);
    return { ast, errors: [] };
  } catch (error) {
    // Extract error information from parser exception
    const parseError = {
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
 * @param {any[]} ast 
 * @returns {any[]}
 */
function extractVariables(ast) {
  const variables = [];
  
  for (const node of ast) {
    if (node.type === 'Directive') {
      const directive = node;
      
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
 * @param {any[]} ast 
 * @returns {any[]}
 */
function extractImports(ast) {
  const imports = [];
  
  for (const node of ast) {
    if (node.type === 'Directive') {
      const directive = node;
      
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
 * @param {any[]} ast 
 * @param {string} variableName 
 * @returns {any[]}
 */
function findVariableReferences(ast, variableName) {
  const references = [];
  
  function visitNode(node) {
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

function getVariableKind(subtype) {
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

function getImportPath(directive) {
  // Extract path from import directive
  // This depends on the exact AST structure
  const pathNode = directive.path;
  return pathNode?.value || '';
}

function getImportedVariables(directive) {
  // Extract imported variable names from ImportSelected directive
  const imports = directive.imports;
  if (Array.isArray(imports)) {
    return imports.map((imp) => imp.value || imp);
  }
  return [];
}

module.exports = {
  parseDocument,
  extractVariables,
  extractImports,
  findVariableReferences
};