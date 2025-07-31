import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { LocationHelpers } from '@services/lsp/utils/LocationHelpers';

export class VariableVisitor extends BaseVisitor {
  private mainVisitor: any;
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'VariableReference';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    const identifier = node.identifier || '';
    const valueType = node.valueType;
    
    
    // Skip only 'identifier' valueType (used in declarations)
    // 'varIdentifier' should be processed (used in references)
    if (valueType === 'identifier') {
      return;
    }
    
    const baseLength = identifier.length + 1;
    
    if (context.interpolationAllowed && (context.templateType || context.inCommand)) {
      this.handleInterpolation(node, context, identifier, valueType, baseLength);
    } else {
      this.handleRegularReference(node, context, identifier, valueType, baseLength);
    }
  }
  
  private handleInterpolation(
    node: any,
    context: VisitorContext,
    identifier: string,
    valueType: string,
    baseLength: number
  ): void {
    if (context.templateType === 'tripleColon' && valueType === 'varIdentifier') {
      const actualLength = node.location.end.column - node.location.start.column;
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: actualLength,
        tokenType: 'interpolation',
        modifiers: []
      });
    } else if (context.variableStyle === '@var' && valueType === 'varIdentifier') {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: baseLength,
        tokenType: 'interpolation',
        modifiers: []
      });
    } else if (context.variableStyle === '{{var}}' && valueType === 'varInterpolation') {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: identifier.length + 4,
        tokenType: 'interpolation',
        modifiers: []
      });
    } else if (node.identifier) {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: baseLength,
        tokenType: 'variable',
        modifiers: ['invalid']
      });
    }
  }
  
  private handleRegularReference(
    node: any,
    context: VisitorContext,
    identifier: string,
    valueType: string,
    baseLength: number
  ): void {
    if (valueType === 'varIdentifier' || valueType === 'varInterpolation') {
      // Check if the location already includes the @ symbol
      // In /show directive context, the AST location doesn't include @
      // In other contexts (assignments, expressions, objects), it does
      const source = this.document.getText();
      const charAtOffset = source.charAt(node.location.start.offset);
      const includesAt = charAtOffset === '@';
      
      // If location doesn't start with @, we need to go back one position
      const charPos = includesAt 
        ? node.location.start.column - 1   // Already includes @, just convert to 0-based
        : node.location.start.column - 2;  // Doesn't include @, go back one more
      
      
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: charPos,
        length: baseLength,
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
      
      if (node.fields && Array.isArray(node.fields)) {
        let currentPos = charPos + baseLength;
        
        for (const field of node.fields) {
          if (field.type === 'field' && field.value) {
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: currentPos,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
            currentPos += 1;
            
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: currentPos,
              length: field.value.length,
              tokenType: 'property',
              modifiers: []
            });
            currentPos += field.value.length;
          } else if (field.type === 'arrayIndex' && field.value !== undefined) {
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: currentPos,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
            currentPos += 1;
            
            const indexStr = String(field.value);
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: currentPos,
              length: indexStr.length,
              tokenType: 'number',
              modifiers: []
            });
            currentPos += indexStr.length;
            
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: currentPos,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
            currentPos += 1;
          }
        }
      }
      
      // Handle pipes if present
      if (node.pipes && Array.isArray(node.pipes)) {
        const sourceText = this.document.getText();
        const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
        
        let pipePos = nodeText.indexOf('|');
        for (const pipe of node.pipes) {
          if (pipePos !== -1) {
            // Token for "|"
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: node.location.start.column - 1 + pipePos,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
            
            // Token for pipe transform name
            if (pipe.transform) {
              const transformStart = pipePos + 1;
              const hasAt = pipe.hasAt !== false; // Default to true if not specified
              const transformLength = pipe.transform.length + (hasAt ? 1 : 0);
              
              this.tokenBuilder.addToken({
                line: node.location.start.line - 1,
                char: node.location.start.column - 1 + transformStart,
                length: transformLength,
                tokenType: 'variableRef',
                modifiers: ['reference']
              });
              
              // Find next pipe
              pipePos = nodeText.indexOf('|', transformStart + transformLength);
            }
          }
        }
      }
    }
  }
}