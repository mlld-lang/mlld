import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { LocationHelpers } from '@services/lsp/utils/LocationHelpers';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';

export class VariableVisitor extends BaseVisitor {
  private mainVisitor: any;
  private operatorHelper: OperatorTokenHelper;
  
  constructor(document: any, tokenBuilder: any) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
  }
  
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
      
      // Still need to handle property access for interpolated variables
      if (node.fields) {
        if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('test-syntax')) {
          console.log('[INTERPOLATION-FIELDS]', {
            identifier,
            hasFields: !!node.fields,
            fieldCount: node.fields?.length,
            fields: node.fields
          });
        }
        this.operatorHelper.tokenizePropertyAccess(node);
      }
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
      // WORKAROUND: Parser location quirk - inconsistent @ symbol inclusion
      // In /show directive context, the AST location doesn't include @
      // In other contexts (assignments, expressions, objects), it does
      // TODO: Remove this workaround when parser is fixed (see docs/dev/LANGUAGE-SERVER.md:343)
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
      
      // Use OperatorTokenHelper for property access tokenization
      if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('test-syntax')) {
        console.log('[VAR-FIELDS]', {
          identifier,
          hasFields: !!node.fields,
          fieldCount: node.fields?.length,
          fields: node.fields
        });
      }
      this.operatorHelper.tokenizePropertyAccess(node);
      
      // Handle pipes if present
      if (node.pipes && Array.isArray(node.pipes)) {
        // Use OperatorTokenHelper to tokenize all pipeline operators
        this.operatorHelper.tokenizePipelineOperators(node.location.start.offset, node.location.end.offset);
        
        // Still need to tokenize the transform names
        const sourceText = this.document.getText();
        const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
        
        // Since pipe locations in AST are unreliable, we'll parse the text manually
        let currentPos = 0;
        let pipeIndex = 0;
        
        while (pipeIndex < node.pipes.length) {
          const pipePos = nodeText.indexOf('|', currentPos);
          if (pipePos === -1) break;
          
          const pipe = node.pipes[pipeIndex];
          if (pipe.transform) {
            // Skip whitespace after |
            let transformStart = pipePos + 1;
            while (transformStart < nodeText.length && /\s/.test(nodeText[transformStart])) {
              transformStart++;
            }
            
            // Calculate absolute position of the transform
            const transformStartOffset = node.location.start.offset + transformStart;
            const transformPosition = this.document.positionAt(transformStartOffset);
            const hasAt = pipe.hasAt !== false; // Default to true if not specified
            const transformLength = pipe.transform.length + (hasAt ? 1 : 0);
            
            this.tokenBuilder.addToken({
              line: transformPosition.line,
              char: transformPosition.character,
              length: transformLength,
              tokenType: 'variableRef',
              modifiers: ['reference']
            });
            
            // Move past this transform for next search
            currentPos = transformStart + transformLength;
          }
          pipeIndex++;
        }
      }
    }
  }
}