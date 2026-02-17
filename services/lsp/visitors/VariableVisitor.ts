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

    if (process.env.DEBUG) {
      console.log('[VAR-VISITOR]', { identifier, valueType, location: `${node.location.start.line}:${node.location.start.column}` });
    }

    // Handle import aliases and special resolvers which may not include '@' at location
    if (valueType === 'import' || valueType === 'importAlias' || valueType === 'specialResolver') {
      const targetIdentifier = (node.alias && (identifier === '*' || !identifier)) ? node.alias : identifier;
      this.handleImportLikeReference(node, targetIdentifier);
      return;
    }

    // Skip identifiers that are declarations (var/exe function names)
    // These are already tokenized by handleVariableDeclaration
    if (valueType === 'identifier') {
      const source = this.document.getText();
      const charAtOffset = source.charAt(node.location.start.offset);
      const includesAt = charAtOffset === '@';

      if (!includesAt) {
        if (process.env.DEBUG) {
          console.log('[VAR-VISITOR] Skipping identifier valueType (no @ in location)');
        }
        return;
      }
      // If location includes @, fall through to process it
      if (process.env.DEBUG) {
        console.log('[VAR-VISITOR] Processing identifier valueType (@ in location, likely export)');
      }
    }

    // Skip exe function identifiers that have broken AST locations spanning entire directive
    // These are already tokenized as 'function' by handleVariableDeclaration
    // Note: computed property calls like @obj.field[@key](args) can have spans up to ~100 chars
    // So we use 150 as threshold to avoid false positives while still catching truly broken spans
    if (valueType === 'varIdentifier' && node.location) {
      const locationSpan = node.location.end.offset - node.location.start.offset;
      // If location spans more than 150 chars, it's likely a broken identifier location
      if (locationSpan > 150) {
        return;
      }
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
    // In triple-colon templates, only {{var}} form interpolates; '@var' is plain text
    if (context.variableStyle === '@var' && valueType === 'varIdentifier') {
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
        
        // Visit nested VariableReferences inside variableIndex fields (e.g., @obj[@key])
        for (const field of node.fields) {
          if (field.type === 'variableIndex' && field.value?.type === 'VariableReference') {
            this.mainVisitor.visitNode(field.value, context);
          }
        }
      }
    } else if (context.variableStyle === '{{var}}' && valueType === 'varInterpolation') {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: identifier.length + 4,
        tokenType: 'interpolation',
        modifiers: []
      });

      // Tokenize field access for {{var.field}} style
      if (node.fields) {
        if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('test-syntax')) {
          console.log('[INTERPOLATION-FIELDS {{}}]', {
            identifier,
            hasFields: !!node.fields,
            fieldCount: node.fields?.length,
            fields: node.fields
          });
        }
        this.operatorHelper.tokenizePropertyAccess(node);
      }
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
    if (valueType === 'varIdentifier' || valueType === 'varInterpolation' || valueType === 'identifier') {
      // Find @ position using offset-based search
      // This is more reliable than column arithmetic which breaks with:
      // - Multi-byte characters, tabs, datatype labels, etc.
      const source = this.document.getText();
      const startOffset = node.location.start.offset;
      const charAtOffset = source.charAt(startOffset);
      const includesAt = charAtOffset === '@';

      if (process.env.DEBUG) {
        console.log('[VAR-POS]', {
          identifier,
          startOffset,
          charAtOffset,
          includesAt,
          line: node.location.start.line,
          column: node.location.start.column
        });
      }

      // Search for @ symbol near node location
      let atOffset = startOffset;
      if (!includesAt) {
        // Location doesn't include @, search for it nearby
        // First try searching forward (for bracket expressions like [@var])
        const forwardSearchEnd = Math.min(source.length, startOffset + 3);
        const forwardText = source.substring(startOffset, forwardSearchEnd);
        const forwardIndex = forwardText.indexOf('@');

        if (forwardIndex !== -1) {
          atOffset = startOffset + forwardIndex;
        } else {
          // Try searching backwards (for other cases)
          const searchStart = Math.max(0, startOffset - 10);
          const searchText = source.substring(searchStart, startOffset + 1);
          const backwardIndex = searchText.lastIndexOf('@');
          if (backwardIndex !== -1) {
            atOffset = searchStart + backwardIndex;
          } else {
            // Fallback: couldn't find @, skip this token
            if (process.env.DEBUG) {
              console.log('[VAR-VISITOR] Could not find @ symbol', {
                identifier,
                startOffset,
                forwardText,
                searchText
              });
            }
            return;
          }
        }
      }

      // Convert offset to line/character position
      const atPos = this.document.positionAt(atOffset);
      const charPos = atPos.character;

      if (process.env.DEBUG) {
        console.log('[VAR-TOKEN]', {
          identifier,
          atOffset,
          line: atPos.line,
          char: charPos,
          length: baseLength
        });
      }

      // All variable references are tokenized as variables
      // (built-in resolver names like @now, @input can be shadowed by user variables)
      const tokenType = 'variableRef';
      const modifiers: string[] = ['reference'];

      // Check for _key pattern (used in for loops for array indices)
      if (identifier.endsWith('_key')) {
        modifiers.push('key');
      }

      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: charPos,
        length: baseLength,
        tokenType,
        modifiers
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

      // Visit nested VariableReferences inside variableIndex fields (e.g., @templates[@key])
      if (node.fields && Array.isArray(node.fields)) {
        for (const field of node.fields) {
          if (field.type === 'variableIndex' && field.value?.type === 'VariableReference') {
            // Visit the nested VariableReference
            this.mainVisitor.visitNode(field.value, context);
          }
        }
      }

      // Handle pipes if present
      if (node.pipes && Array.isArray(node.pipes) && node.pipes.length > 0) {
        if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('test-syntax') || this.document.uri.includes('test-vscode')) {
          console.log('[VAR-PIPES]', {
            identifier: node.identifier,
            pipeCount: node.pipes.length,
            pipes: node.pipes.map(p => ({ transform: p.transform, hasAt: p.hasAt }))
          });
        }
        
        // Parse text to find pipe and transform positions
        const sourceText = this.document.getText();
        const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
        
        if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('test-syntax') || this.document.uri.includes('test-vscode')) {
          console.log('[VAR-PIPES-TEXT]', { nodeText });
        }
        
        let currentPos = 0;

        for (let pipeIndex = 0; pipeIndex < node.pipes.length; pipeIndex++) {
          const pipePos = nodeText.indexOf('|', currentPos);
          if (pipePos === -1) break;
          
          if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('debug-even') || this.document.uri.includes('test-vscode') || this.document.uri.includes('test-final')) {
            console.log('[PIPE-SEARCH]', {
              pipeIndex,
              currentPos,
              pipePos,
              searchingFrom: nodeText.substring(currentPos),
              fullText: nodeText
            });
          }
          
          // Token for '|' or '||' (parallel group)
          const absolutePipePos = node.location.start.offset + pipePos;
          const isParallel = nodeText[pipePos + 1] === '|';
          const pipePosition = this.document.positionAt(absolutePipePos);
          this.tokenBuilder.addToken({
            line: pipePosition.line,
            char: pipePosition.character,
            length: isParallel ? 2 : 1,
            tokenType: 'operator',
            modifiers: []
          });
          
          const pipe = node.pipes[pipeIndex];
          if (pipe && pipe.transform) {
            // Skip whitespace after |
            let transformStart = pipePos + (isParallel ? 2 : 1);
            while (transformStart < nodeText.length && /\s/.test(nodeText[transformStart])) {
              transformStart++;
            }
            
            if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('test-final')) {
              console.log('[TRANSFORM-POS]', {
                pipeIndex,
                pipePos,
                transformStart,
                charAtTransformStart: nodeText[transformStart],
                expectedTransform: pipe.transform
              });
            }
            
            // Calculate absolute position of the transform
            const transformStartOffset = node.location.start.offset + transformStart;
            const transformPosition = this.document.positionAt(transformStartOffset);
            const hasAt = pipe.hasAt !== false;

            // Support inline effects in pipelines: show, log, output
            const effectName = pipe.transform || '';
            const isEffect = !hasAt && /^(show|log|output)\b/.test(effectName);

            if (isEffect) {
              // Add keyword token for the effect
              this.tokenBuilder.addToken({
                line: transformPosition.line,
                char: transformPosition.character,
                length: effectName.length,
                tokenType: 'keyword',
                modifiers: []
              });

              // Heuristically tokenize common effect arguments
              const afterEffectPos = transformStart + effectName.length;
              // Slice until next pipe or end of node
              const rest = nodeText.slice(afterEffectPos, nodeText.indexOf('|', afterEffectPos) === -1 ? nodeText.length : nodeText.indexOf('|', afterEffectPos));

              // For `output`, expect: optional source var, 'to', then target
              if (effectName === 'output') {
                // Source variable immediately after 'output'
                const varMatch = rest.match(/\s+(@[A-Za-z_][A-Za-z0-9_]*)/);
                if (varMatch && varMatch.index !== undefined) {
                  const varOffset = transformStartOffset + effectName.length + varMatch.index + varMatch[0].indexOf('@');
                  const varPos = this.document.positionAt(varOffset);
                  this.tokenBuilder.addToken({
                    line: varPos.line,
                    char: varPos.character,
                    length: varMatch[1].length,
                    tokenType: 'variable',
                    modifiers: []
                  });
                }
                // 'to' keyword
                const toMatch = rest.match(/\s+to\s+/);
                if (toMatch && toMatch.index !== undefined) {
                  const toOffset = transformStartOffset + effectName.length + toMatch.index + toMatch[0].indexOf('to');
                  const toPos = this.document.positionAt(toOffset);
                  this.tokenBuilder.addToken({
                    line: toPos.line,
                    char: toPos.character,
                    length: 2,
                    tokenType: 'keyword',
                    modifiers: []
                  });
                  // Target: stdout|stderr or @var or "string"
                  const targetStart = toMatch.index + toMatch[0].length;
                  const targetRest = rest.slice(targetStart);
                  const streamMatch = targetRest.match(/^(stdout|stderr)\b/);
                  if (streamMatch) {
                    const streamOffset = transformStartOffset + effectName.length + targetStart;
                    const streamPos = this.document.positionAt(streamOffset);
                    this.tokenBuilder.addToken({
                      line: streamPos.line,
                      char: streamPos.character,
                      length: streamMatch[1].length,
                      tokenType: 'keyword',
                      modifiers: []
                    });
                  } else {
                    const targetVar = targetRest.match(/^(@[A-Za-z_][A-Za-z0-9_]*)/);
                    if (targetVar) {
                      const tOffset = transformStartOffset + effectName.length + targetStart;
                      const tPos = this.document.positionAt(tOffset);
                      this.tokenBuilder.addToken({
                        line: tPos.line,
                        char: tPos.character,
                        length: targetVar[1].length,
                        tokenType: 'variable',
                        modifiers: []
                      });
                    } else if (/^"/.test(targetRest)) {
                      // Quoted path: read until next unescaped quote
                      const m = targetRest.match(/^"([^"\\]|\\.)*"/);
                      if (m) {
                        const qOffset = transformStartOffset + effectName.length + targetStart;
                        const qPos = this.document.positionAt(qOffset);
                        this.tokenBuilder.addToken({
                          line: qPos.line,
                          char: qPos.character,
                          length: m[0].length,
                          tokenType: 'string',
                          modifiers: []
                        });
                      }
                    }
                  }
                }
              } else {
                // show/log: optional immediate @var or quoted/backtick string
                const simpleArg = rest.match(/\s+(@[A-Za-z_][A-Za-z0-9_]*|`[^`]*`|"([^"\\]|\\.)*"|\'([^'\\]|\\.)*\')/);
                if (simpleArg && simpleArg.index !== undefined) {
                  const argText = simpleArg[1] || simpleArg[0].trim();
                  const argStartLocal = afterEffectPos + simpleArg.index + simpleArg[0].indexOf(argText);
                  const argOffset = node.location.start.offset + argStartLocal;
                  const argPos = this.document.positionAt(argOffset);
                  const tokenType = argText.startsWith('@') ? 'variable' : 'string';
                  this.tokenBuilder.addToken({
                    line: argPos.line,
                    char: argPos.character,
                    length: argText.length,
                    tokenType,
                    modifiers: []
                  });
                }
              }

              // Advance currentPos conservatively to after the effect name
              currentPos = transformStart + effectName.length;
            } else {
              // Regular @transform - use function token type (purple italic)
              // Pipeline transforms are function invocations with implicit stdin
              const transformLength = (pipe.transform?.length || 0) + (hasAt ? 1 : 0);
              const tokenInfo = {
                line: transformPosition.line,
                char: transformPosition.character,
                length: transformLength,
                tokenType: 'function',
                modifiers: []
              };
              if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('test-final') || this.document.uri.includes('test-syntax')) {
                console.log('[PIPE-TOKEN]', { pipeIndex, transform: pipe.transform, token: tokenInfo });
              }
              this.tokenBuilder.addToken(tokenInfo);
              currentPos = transformStart + transformLength;
            }
            
            if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('simple-four')) {
              console.log('[PIPE-NEXT]', {
                pipeIndex,
                transformStart,
                transformLength,
                newCurrentPos: currentPos,
                remainingText: nodeText.substring(currentPos)
              });
            }
          } else {
            // No transform, just move past the pipe(s)
            currentPos = pipePos + (isParallel ? 2 : 1);
          }
        }
      }
    }
  }

  private handleImportLikeReference(node: any, identifier: string): void {
    if (!identifier || !node.location) return;

    const source = this.document.getText();
    const startOffset = node.location.start.offset;
    const endOffset = node.location.end.offset;
    const segment = source.substring(startOffset, endOffset);
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let matchIndex = -1;
    let length = 0;

    const atPattern = new RegExp(`@${escaped}\\b`);
    const atMatch = segment.match(atPattern);
    if (atMatch && atMatch.index !== undefined) {
      matchIndex = atMatch.index;
      length = identifier.length + 1;
    } else {
      const wordPattern = new RegExp(`\\b${escaped}\\b`);
      const wordMatch = segment.match(wordPattern);
      if (wordMatch && wordMatch.index !== undefined) {
        matchIndex = wordMatch.index;
        length = identifier.length;
      }
    }

    if (matchIndex === -1) return;

    const offset = startOffset + matchIndex;
    const pos = this.document.positionAt(offset);

    this.tokenBuilder.addToken({
      line: pos.line,
      char: pos.character,
      length,
      tokenType: 'variableRef',
      modifiers: ['reference']
    });
  }
}
