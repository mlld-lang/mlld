import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { EffectTokenHelper } from '@services/lsp/utils/EffectTokenHelper';
import { LocationHelpers } from '@services/lsp/utils/LocationHelpers';
import { TextExtractor } from '@services/lsp/utils/TextExtractor';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';
import { CommentTokenHelper } from '@services/lsp/utils/CommentTokenHelper';
import { LanguageBlockHelper } from '@services/lsp/utils/LanguageBlockHelper';
import { embeddedLanguageService } from '@services/lsp/embedded/EmbeddedLanguageService';

export class DirectiveVisitor extends BaseVisitor {
  private mainVisitor: any;
  private operatorHelper: OperatorTokenHelper;
  private commentHelper: CommentTokenHelper;
  private languageHelper: LanguageBlockHelper;
  
  constructor(document: any, tokenBuilder: any) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
    this.commentHelper = new CommentTokenHelper(document, tokenBuilder);
    this.languageHelper = new LanguageBlockHelper(document, tokenBuilder);
  }
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'Directive';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;


    // Add directive token for both explicit (with /) and implicit directives (without /)
    if (node.kind) {
      const sourceText = this.document.getText();
      const startOffset = node.location.start.offset;
      const hasSlash = sourceText[startOffset] === '/';

      // TEST: Use different token types for different directives to see colors
      const tokenType = this.getDirectiveTokenType(node.kind);

      // For implicit directives, check if the keyword appears at the start
      if (node.meta?.implicit) {
        // Check if the keyword matches at the start position
        const keywordAtStart = sourceText.substring(startOffset, startOffset + node.kind.length);
        if (keywordAtStart === node.kind) {
          // Tokenize the keyword without slash
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: node.location.start.column - 1,
            length: node.kind.length,
            tokenType,
            modifiers: []
          });
        }
      } else {
        // For explicit directives, include the slash
        const tokenLength = hasSlash
          ? (node.kind?.length || 0) + 1
          : (node.kind?.length || 0);

        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: tokenLength,
          tokenType,
          modifiers: []
        });
      }
    }
    
    if (node.kind === 'when') {
      this.visitWhenDirective(node, context);
      this.handleDirectiveComment(node);
      return;
    }

    if (node.kind === 'output') {
      this.visitOutputDirective(node, context);
      this.handleDirectiveComment(node);
      return;
    }

    if (node.kind === 'import') {
      this.visitImportDirective(node, context);
      this.handleDirectiveComment(node);
      return;
    }

    if (node.kind === 'for') {
      this.visitForDirective(node, context);
      this.handleDirectiveComment(node);
      return;
    }

    if (node.kind === 'export') {
      this.visitExportDirective(node, context);
      this.handleDirectiveComment(node);
      return;
    }

    if (node.kind === 'guard') {
      this.visitGuardDirective(node, context);
      this.handleDirectiveComment(node);
      return;
    }

    // /append is like /output - writes to a target
    if (node.kind === 'append') {
      this.visitOutputDirective(node, context);
      this.handleDirectiveComment(node);
      return;
    }

    if (node.kind === 'while') {
      this.visitWhileDirective(node, context);
      this.handleDirectiveComment(node);
      return;
    }

    if (node.kind === 'stream') {
      this.visitStreamDirective(node, context);
      this.handleDirectiveComment(node);
      return;
    }

    // Handle implicit exe directives (e.g., @transform() = @applyFilter(@data))
    if (node.kind === 'exe' && node.meta?.implicit && node.values?.commandRef) {
      // Token for @commandName
      const commandName = node.values.commandRef.name;
      if (commandName && node.location) {
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: (commandName?.length || 0) + 1, // +1 for @
          tokenType: 'variable',
          modifiers: ['declaration']
        });
        
        // Add parentheses if present
        const hasParens = node.values.commandRef.args !== undefined;
        if (hasParens && commandName) {
          // Opening parenthesis
          this.operatorHelper.addOperatorToken(
            node.location.start.offset + (commandName?.length || 0) + 1, // after @name
            1
          );
          
          // Process arguments if any
          if (node.values.commandRef.args && node.values.commandRef.args.length > 0) {
            for (const arg of node.values.commandRef.args) {
              this.mainVisitor.visitNode(arg, context);
            }
          }
          
          // Closing parenthesis - need to find it
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          const closeParenMatch = nodeText.match(/\)/);
          if (closeParenMatch && closeParenMatch.index !== undefined) {
            const closeParenPosition = this.document.positionAt(node.location.start.offset + closeParenMatch.index);
            this.tokenBuilder.addToken({
              line: closeParenPosition.line,
              char: closeParenPosition.character,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
        
        // Add = operator if there's a value
        if (node.values.value) {
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          const equalMatch = nodeText.match(/\)\s*=|\s+=/); // Match ) = or just =
          if (equalMatch && equalMatch.index !== undefined) {
            const equalIndex = equalMatch[0].indexOf('=');
            const equalPosition = this.document.positionAt(
              node.location.start.offset + equalMatch.index + equalIndex
            );
            this.tokenBuilder.addToken({
              line: equalPosition.line,
              char: equalPosition.character,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      }
    }
    
    if ((node.kind === 'var' || node.kind === 'exe' || node.kind === 'path') &&
        node.values?.identifier) {
      // For /exe with params (even if empty like @func()), handle variable declaration without = first
      if (node.kind === 'exe' && node.values?.params !== undefined) {
        this.handleVariableDeclaration(node, true); // Skip = operator for now

        // Handle parameters if any
        if (node.values.params.length > 0) {
          // Add opening parenthesis
          const firstParam = node.values.params[0];
          if (firstParam && firstParam.location) {
            this.operatorHelper.addOperatorToken(
              firstParam.location.start.offset - 1, // '(' is before param
              1
            );
          }

          // Process parameters
          for (let i = 0; i < node.values.params.length; i++) {
            const param = node.values.params[i];
            this.mainVisitor.visitNode(param, context);

            // Add comma after each parameter except the last
            if (i < node.values.params.length - 1 && param.location) {
              const nextParam = node.values.params[i + 1];
              if (nextParam && nextParam.location) {
                this.operatorHelper.tokenizeOperatorBetween(
                  param.location.end.offset,
                  nextParam.location.start.offset,
                  ','
                );
              }
            }
          }

          // Add closing parenthesis
          const lastParam = node.values.params[node.values.params.length - 1];
          if (lastParam && lastParam.location) {
            // The closing parenthesis is right after the last parameter
            this.operatorHelper.addOperatorToken(
              lastParam.location.end.offset,
              1
            );
          }
        } else {
          // Empty params: just tokenize ()
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          const parenMatch = nodeText.match(/\(\)/);
          if (parenMatch && parenMatch.index !== undefined) {
            const parenOffset = node.location.start.offset + parenMatch.index;
            this.operatorHelper.addOperatorToken(parenOffset, 1); // (
            this.operatorHelper.addOperatorToken(parenOffset + 1, 1); // )
          }
        }
        
        // Now add the = operator after the closing parenthesis
        if (node.values.value !== undefined || node.values.template !== undefined ||
            node.values.command !== undefined || node.values.code !== undefined ||
            node.values.content !== undefined || node.meta?.wrapperType !== undefined ||
            node.values.statements !== undefined) {
          // Find the = sign in the source text after the closing parenthesis
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          const equalMatch = nodeText.match(/\)\s*=/);

          if (equalMatch && equalMatch.index !== undefined) {
            const equalIndex = equalMatch[0].lastIndexOf('=');
            const equalOffset = node.location.start.offset + equalMatch.index + equalIndex;
            this.operatorHelper.addOperatorToken(equalOffset, 1);
          }
        }

        // Handle exe blocks: /exe @func() = [statements; => return]
        if (node.subtype === 'exeBlock' && node.values.statements) {
          this.visitExeBlock(node, context);
          this.tokenizeSecurityLabels(node);
          this.handleDirectiveComment(node);
          return; // Skip normal value processing
        }
      } else {
        // For other directives or exe without params, handle normally
        this.handleVariableDeclaration(node);
      }
      
    }

    if (node.values) {
      this.visitDirectiveValues(node, context);
    }

    // Handle end-of-line comments
    this.handleDirectiveComment(node);
  }

  private visitExportDirective(directive: any, context: VisitorContext): void {
    // Tokenize exported symbols within braces
    const exports = directive.values?.exports;
    if (Array.isArray(exports)) {
      for (const exp of exports) {
        if (exp && exp.location) {
          this.tokenBuilder.addToken({
            line: exp.location.start.line - 1,
            char: exp.location.start.column - 1,
            length: (exp.identifier?.length || 0),
            tokenType: 'variable',
            modifiers: ['declaration']
          });
        }
      }
    }
  }
  
  private visitEndOfLineComment(comment: any): void {
    if (!comment.location) return;

    if (process.env.DEBUG_LSP || this.document.uri.includes('test-syntax')) {
      console.log('[EOL-COMMENT]', {
        marker: comment.marker,
        content: comment.content,
        location: `${comment.location.start.line}:${comment.location.start.column}-${comment.location.end.line}:${comment.location.end.column}`,
        offset: `${comment.location.start.offset}-${comment.location.end.offset}`
      });
    }

    this.commentHelper.tokenizeEndOfLineComment(comment);
  }

  /**
   * Handle end-of-line comments attached to directives via meta.comment
   * Call this before early returns to ensure comments are tokenized
   */
  private handleDirectiveComment(node: any): void {
    if (node.meta?.comment) {
      this.visitEndOfLineComment(node.meta.comment);
    }
  }

  private handleVariableDeclaration(node: any, skipEquals: boolean = false): void {
    const identifierNodes = node.values.identifier;
    if (Array.isArray(identifierNodes) && identifierNodes.length > 0) {
      const firstIdentifier = identifierNodes[0];
      const identifierName = firstIdentifier.identifier || '';

      if (identifierName) {
        // Check source text to determine if directive has slash
        const sourceText = this.document.getText();
        const startOffset = node.location.start.offset;
        const hasSlash = sourceText[startOffset] === '/';

        // Find the actual @ position in source (accounts for datatype labels)
        const directiveText = sourceText.substring(startOffset, node.location.end.offset);
        const atIndex = directiveText.indexOf('@' + identifierName);

        if (atIndex !== -1) {
          const atPosition = this.document.positionAt(startOffset + atIndex);

          // Use 'function' for exe declarations, 'variable' for var/path
          const tokenType = node.kind === 'exe' ? 'function' : 'variable';

          this.tokenBuilder.addToken({
            line: atPosition.line,
            char: atPosition.character,
            length: identifierName.length + 1,
            tokenType,
            modifiers: ['declaration']
          });
        } else {
          // Fallback to old calculation (shouldn't happen)
          const identifierStart = hasSlash
            ? node.location.start.column + node.kind.length + 2
            : node.location.start.column + node.kind.length + 1;

          const tokenType = node.kind === 'exe' ? 'function' : 'variable';

          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: identifierStart - 1,
            length: identifierName.length + 1,
            tokenType,
            modifiers: ['declaration']
          });
        }
        
        // Add = operator token if there's a value (unless skipEquals is true)
        if (!skipEquals && (node.values.value !== undefined || node.values.template !== undefined ||
            node.values.command !== undefined || node.values.code !== undefined ||
            node.values.content !== undefined || node.meta?.wrapperType !== undefined)) {
          // Find = operator by searching after the variable name
          const varEnd = atIndex + identifierName.length + 1; // Position after @var
          let baseOffset = startOffset + varEnd;
          
          // For /exe with params, = comes after the closing parenthesis
          if (node.kind === 'exe' && node.values.params && node.values.params.length > 0) {
            const lastParam = node.values.params[node.values.params.length - 1];
            if (lastParam?.location) {
              const equalOffset = this.operatorHelper.findOperatorNear(
                lastParam.location.end.offset,
                '=',
                10,
                'forward'
              );
              if (equalOffset !== null) {
                this.operatorHelper.addOperatorToken(equalOffset, 1);
              }
            }
          } else {
            // Find = after the variable name
            const equalOffset = this.operatorHelper.findOperatorNear(
              baseOffset,
              '=',
              20,  // Increased search distance for implicit directives
              'forward'
            );
            
            
            if (equalOffset !== null) {
              this.operatorHelper.addOperatorToken(equalOffset, 1);
            }
          }
        }
      }
    }
  }
  
  private visitDirectiveValues(directive: any, context: VisitorContext): void {
    const values = directive.values;
    
    
    // Handle /show directives with content field first
    if (directive.kind === 'show' && values.content) {
      // Check for wrapperType in either location (meta or content[0])
      let wrapperType = directive.meta?.wrapperType ||
                       (values.content[0] && values.content[0].wrapperType);

      // If wrapperType not in meta (common for nested show in for/when), infer from source
      if (!wrapperType && directive.location) {
        const sourceText = this.document.getText();
        const directiveText = sourceText.substring(
          directive.location.start.offset,
          directive.location.end.offset
        );
        // Check what quote character appears after 'show'
        if (directiveText.match(/show\s*"/)) {
          wrapperType = 'doubleQuote';
        } else if (directiveText.match(/show\s*'/)) {
          wrapperType = 'singleQuote';
        } else if (directiveText.match(/show\s*`/)) {
          wrapperType = 'backtick';
        } else if (directiveText.match(/show\s*:::/)) {
          wrapperType = 'tripleColon';
        } else if (directiveText.match(/show\s*::/)) {
          wrapperType = 'doubleColon';
        }
      }

      if (wrapperType) {
        // For show directives, determine the template content structure
        // Top-level: values.content[0].content is array of Text/VarRef
        // Nested: values.content is already array of Text/VarRef
        let templateContent;
        if (values.content[0]?.content && Array.isArray(values.content[0].content)) {
          // Nested structure - extract from first item
          templateContent = values.content[0].content;
        } else {
          // Flat structure - use as-is
          templateContent = values.content;
        }

        const tempDirective = {
          ...directive,
          values: { ...values, value: templateContent },
          meta: { ...directive.meta, wrapperType }
        };
        this.visitTemplateValue(tempDirective, context);
        return;
      } else {
        // No wrapperType found, but we still need to process the content
        // This happens for show directives in for actions
        if (Array.isArray(values.content)) {
          for (const contentItem of values.content) {
            if (contentItem.content && Array.isArray(contentItem.content)) {
              // Process template content nodes
              for (const node of contentItem.content) {
                this.mainVisitor.visitNode(node, context);
              }
            } else {
              this.mainVisitor.visitNode(contentItem, context);
            }
          }
        }
        return;
      }
    }
    
    if (directive.kind === 'run') {
      this.visitRunDirective(directive, context);
      return;
    }
    
    if (directive.kind === 'exe' && values.template) {
      // Use visitTemplateValue to properly handle template delimiters
      this.visitTemplateValue(directive, context);
      return; // Template fully handled, don't visit children again
    } else if (directive.kind === 'exe' && values.code && directive.raw?.lang) {
      // Handle /exe with inline code
      this.visitInlineCode(directive, context);
      return; // Code fully handled, don't visit children again
    } else if (directive.meta?.wrapperType) {
      this.visitTemplateValue(directive, context);
      return; // Template fully handled, don't visit children again
    } else if (values.variable) {
      if (Array.isArray(values.variable)) {
        for (const varRef of values.variable) {
          this.mainVisitor.visitNode(varRef, context);
        }
      } else {
        this.mainVisitor.visitNode(values.variable, context);
      }
    } else if (values.command) {
      if (Array.isArray(values.command)) {
        const newContext = {
          ...context,
          inCommand: true,
          interpolationAllowed: true,
          variableStyle: '@var' as const
        };
        
        for (const part of values.command) {
          this.mainVisitor.visitNode(part, newContext);
        }
      } else {
        this.mainVisitor.visitNode(values.command, context);
      }
    } else if (values.expression) {
      this.mainVisitor.visitNode(values.expression, context);
    } else if (values.value && Array.isArray(values.value)) {
      // First handle the value array (e.g., load-content nodes)
      // Check if this is a code node array first
      if (values.value.length === 1 && values.value[0]?.type === 'code') {
        // This is inline code like /var @x = js { ... }
        this.visitInlineCode(directive, context);
      } else {
        for (const node of values.value) {
          if (typeof node === 'object' && node !== null) {
            this.mainVisitor.visitNode(node, context);
          } else if (directive.location) {
            this.handlePrimitiveValue(node, directive);
          }
        }
      }
      
      // Then handle withClause if present
      if (values.withClause) {
        this.visitWithClause(values.withClause, directive, context);
      }
    } else if (values.value !== undefined && directive.location) {
      // Check if the value is a WhenExpression object
      if (typeof values.value === 'object' && values.value !== null && values.value.type === 'WhenExpression') {
        this.mainVisitor.visitNode(values.value, context);
      } else {
        this.handlePrimitiveValue(values.value, directive);
      }
    } else if (values.loadContent) {
      // Handle file references with or without sections
      this.mainVisitor.visitNode(values.loadContent, context);
    } else if (values.code && directive.location) {
      // Handle inline code in /var and /exe directives (e.g., /var @x = js { return 42; })
      this.visitInlineCode(directive, context);
    }
    
    // Handle withClause for directives that don't have values.value
    if (values.withClause && !values.value) {
      this.visitWithClause(values.withClause, directive, context);
    }

    this.visitChildren(values, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));

    // Tokenize security labels if present (for /var, /exe, /path, etc.)
    this.tokenizeSecurityLabels(directive);
  }
  
  private visitWithClause(withClause: any, directive: any, context: VisitorContext): void {
    // Find and tokenize the "with" keyword
    const source = this.document.getText();
    const directiveText = source.substring(directive.location.start.offset, directive.location.end.offset);
    const withIndex = directiveText.indexOf(' with ');

    if (withIndex !== -1) {
      // Token for "with" keyword (light teal italic like for/when/while)
      this.tokenBuilder.addToken({
        line: directive.location.start.line - 1,
        char: directive.location.start.column - 1 + withIndex + 1, // +1 to skip the space before "with"
        length: 4,
        tokenType: 'keyword',
        modifiers: []
      });
    }

    // Find the "as" keyword position
    const asIndex = directiveText.lastIndexOf(' as ');
    
    if (asIndex !== -1) {
      // Token for "as" keyword
      this.tokenBuilder.addToken({
        line: directive.location.start.line - 1,
        char: directive.location.start.column - 1 + asIndex + 1, // +1 to skip the space before "as"
        length: 2,
        tokenType: 'keyword',
        modifiers: []
      });
    }

    // Tokenize with.format: "json|csv|xml|text"
    if (withClause?.format) {
      const formatMatch = directiveText.match(/\bformat\s*:\s*("[^"]+")/);
      if (formatMatch && formatMatch.index !== undefined) {
        // Token for 'format' key
        const keyOffset = directive.location.start.offset + formatMatch.index + formatMatch[0].indexOf('format');
        const keyPos = this.document.positionAt(keyOffset);
        this.tokenBuilder.addToken({
          line: keyPos.line,
          char: keyPos.character,
          length: 'format'.length,
          tokenType: 'keyword',
          modifiers: []
        });
        // Token for value string (including quotes)
        const valueText = formatMatch[1];
        const valueStartInMatch = formatMatch[0].indexOf(valueText);
        const valueOffset = directive.location.start.offset + formatMatch.index + valueStartInMatch;
        const valuePos = this.document.positionAt(valueOffset);
        this.tokenBuilder.addToken({
          line: valuePos.line,
          char: valuePos.character,
          length: valueText.length,
          tokenType: 'string',
          modifiers: []
        });
      }
    }

    // Tokenize with.pipeline arrays including nested parallel groups
    if (withClause?.pipeline) {
      // Try to find the 'pipeline' section and its brackets
      const pipelineKeyIndex = directiveText.indexOf('pipeline');
      if (pipelineKeyIndex !== -1) {
        const afterKey = directiveText.substring(pipelineKeyIndex);
        const firstBracketRel = afterKey.indexOf('[');
        if (firstBracketRel !== -1) {
          const absoluteOpen = directive.location.start.offset + pipelineKeyIndex + firstBracketRel;
          // Scan forward to find matching brackets and emit tokens for each '[' and ']'
          let depth = 0;
          let pipelineEndRel = -1;
          for (let i = pipelineKeyIndex + firstBracketRel; i < directiveText.length; i++) {
            const ch = directiveText[i];
            if (ch === '[') {
              depth++;
              const pos = this.document.positionAt(directive.location.start.offset + i);
              this.tokenBuilder.addToken({
                line: pos.line,
                char: pos.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            } else if (ch === ']') {
              const pos = this.document.positionAt(directive.location.start.offset + i);
              this.tokenBuilder.addToken({
                line: pos.line,
                char: pos.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
              depth--;
              if (depth === 0) { pipelineEndRel = i; break; } // Done with pipeline array
            }
          }
          // Tokenize commas inside pipeline arrays for readability
          const closeIdx = pipelineEndRel !== -1 ? pipelineEndRel : directiveText.indexOf(']', pipelineKeyIndex + firstBracketRel);
          if (closeIdx !== -1) {
            const startOffset = directive.location.start.offset + pipelineKeyIndex + firstBracketRel;
            const endOffset = directive.location.start.offset + closeIdx;
            this.operatorHelper.tokenizeListSeparators(startOffset, endOffset, ',');
          }
          // Highlight effect keywords and syntax inside pipeline arrays
          const effectHelper = new EffectTokenHelper(this.document, this.tokenBuilder);
          const segmentStartRel = pipelineKeyIndex + firstBracketRel;
          const segmentEndRel = closeIdx !== -1 ? closeIdx : directiveText.length;
          const segment = directiveText.substring(segmentStartRel, segmentEndRel);

          // Effects: show, log, output (only when not prefixed by @)
          const effectRegex = /(^|[^@A-Za-z0-9_])(show|log|output)\b/g;
          let m: RegExpExecArray | null;
          while ((m = effectRegex.exec(segment)) !== null) {
            const effect = m[2];
          // effRel is relative to directive start; absEff converts to absolute document offset
          const effRel = segmentStartRel + m.index + m[1].length;
          const absEff = directive.location.start.offset + effRel;
            effectHelper.tokenizeEffectKeyword(effect, absEff);

            const stageRest = segment.substring(m.index + m[0].length);
            if (effect === 'output') {
              effectHelper.tokenizeOutputArgs(absEff + effect.length, stageRest);
            } else {
              effectHelper.tokenizeSimpleArg(absEff + effect.length, stageRest);
            }
          }
        }
      }

      // Visit identifiers and args inside pipeline AST for proper variable tokenization
      const stages = Array.isArray(withClause.pipeline) ? withClause.pipeline : [];
      for (const stage of stages) {
        if (Array.isArray(stage)) {
          // Parallel group: visit each command
          for (const cmd of stage) {
            // Skip visiting identifier for effect builtins to avoid double-tokenizing as variable
            if (cmd?.rawIdentifier && /^(show|log|output)$/.test(cmd.rawIdentifier)) {
              // no-op for identifier; args handled below
            } else if (cmd?.identifier) {
              for (const id of cmd.identifier) this.mainVisitor.visitNode(id, context);
            }
            if (cmd?.args) {
              for (const a of cmd.args) this.mainVisitor.visitNode(a, context);
            }
          }
        } else if (stage) {
          if (!(stage.rawIdentifier && /^(show|log|output)$/.test(stage.rawIdentifier))) {
            if (stage.identifier) {
              for (const id of stage.identifier) this.mainVisitor.visitNode(id, context);
            }
          }
          if (stage.args) {
            for (const a of stage.args) this.mainVisitor.visitNode(a, context);
          }
        }
      }
    }

    // Handle the template after "as"
    if (withClause.asSection && Array.isArray(withClause.asSection)) {
      // Find the opening quote position - it comes after "as "
      const asKeywordEnd = asIndex + 4; // " as " is 4 characters
      const afterAs = directiveText.substring(asKeywordEnd);
      const openQuoteIndex = afterAs.indexOf('"');
      
      if (openQuoteIndex !== -1) {
        const openQuotePosition = asKeywordEnd + openQuoteIndex;
        
        // Token for opening quote
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: directive.location.start.column - 1 + openQuotePosition,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        
        // Process nodes within the template
        for (const node of withClause.asSection) {
          if (node.type === 'Text' && node.location) {
            // Token for text content as string
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: node.location.start.column - 1,
              length: node.content.length,
              tokenType: 'string',
              modifiers: []
            });
          } else if (node.type === 'FileReference') {
            // Let FileReferenceVisitor handle the FileReference tokens
            this.mainVisitor.visitNode(node, context);
          }
        }
        
        // Find the closing quote position
        const closingQuoteIndex = directiveText.lastIndexOf('"');
        if (closingQuoteIndex !== -1 && closingQuoteIndex > openQuotePosition) {
          // Token for closing quote
          this.tokenBuilder.addToken({
            line: directive.location.start.line - 1,
            char: directive.location.start.column - 1 + closingQuoteIndex,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
        }
      }
    }
  }
  
  private visitRunDirective(directive: any, context: VisitorContext): void {
    const values = directive.values;

    // Handle working directory path if present (for cmd:/path or sh:/path syntax)
    if (values?.workingDir && Array.isArray(values.workingDir)) {
      for (const pathPart of values.workingDir) {
        if (pathPart.location && pathPart.type === 'PathSeparator') {
          // Tokenize path separator as string
          this.tokenBuilder.addToken({
            line: pathPart.location.start.line - 1,
            char: pathPart.location.start.column - 1,
            length: pathPart.value?.length || 1,
            tokenType: 'string',
            modifiers: []
          });
        } else if (pathPart.location && pathPart.type === 'Text') {
          // Tokenize path text as string
          this.tokenBuilder.addToken({
            line: pathPart.location.start.line - 1,
            char: pathPart.location.start.column - 1,
            length: pathPart.content?.length || 0,
            tokenType: 'string',
            modifiers: []
          });
        } else if (pathPart.type === 'VariableReference') {
          // Handle variable references in path
          this.mainVisitor.visitNode(pathPart, context);
        } else if (pathPart.location) {
          // Fallback for any other path component
          this.mainVisitor.visitNode(pathPart, context);
        }
      }
    }

    // Handle /run @function() syntax (including implicit directives)
    if (values?.execRef) {
      this.mainVisitor.visitNode(values.execRef, context);
      return;
    }

    // Handle /run @function(@args) syntax where subtype is 'runExec'
    if (directive.subtype === 'runExec' && values?.identifier && Array.isArray(values.identifier)) {
      const firstIdentifier = values.identifier[0];
      if (firstIdentifier && firstIdentifier.location) {
        // Tokenize @functionName
        this.tokenBuilder.addToken({
          line: firstIdentifier.location.start.line - 1,
          char: firstIdentifier.location.start.column - 1,
          length: firstIdentifier.identifier.length + 1, // +1 for @
          tokenType: 'variable',
          modifiers: ['reference']
        });

        // Tokenize opening parenthesis
        const openParenOffset = firstIdentifier.location.start.column - 1 + firstIdentifier.identifier.length + 1;
        this.tokenBuilder.addToken({
          line: firstIdentifier.location.start.line - 1,
          char: openParenOffset,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });

        // Tokenize arguments
        const newContext = {
          ...context,
          inCommand: true,
          interpolationAllowed: true,
          variableStyle: '@var' as const,
          inFunctionArgs: true
        };

        if (values.args && Array.isArray(values.args)) {
          for (let i = 0; i < values.args.length; i++) {
            const arg = values.args[i];
            this.mainVisitor.visitNode(arg, newContext);

            // Tokenize comma between args
            if (i < values.args.length - 1 && arg.location) {
              const nextArg = values.args[i + 1];
              if (nextArg.location) {
                this.operatorHelper.tokenizeOperatorBetween(
                  arg.location.end.offset,
                  nextArg.location.start.offset,
                  ','
                );
              }
            }
          }
        }

        // Tokenize closing parenthesis
        const sourceText = this.document.getText();
        const searchStart = firstIdentifier.location.end.offset;
        const searchEnd = Math.min(searchStart + 20, sourceText.length);
        const searchText = sourceText.substring(searchStart, searchEnd);
        const closeParenIndex = searchText.indexOf(')');

        if (closeParenIndex !== -1) {
          const closeParenOffset = searchStart + closeParenIndex;
          const closeParenPos = this.document.positionAt(closeParenOffset);
          this.tokenBuilder.addToken({
            line: closeParenPos.line,
            char: closeParenPos.character,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
        }
      }
      return;
    }

    // Handle /run cmd { ... } syntax with AST-parsed command parts
    if (values?.command && Array.isArray(values.command)) {
      // Find and tokenize 'cmd' keyword if present
      if (directive.location) {
        const sourceText = this.document.getText();
        const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);

        // Check for 'cmd' keyword after /run
        const cmdMatch = directiveText.match(/\/run\s+(cmd)\s*\{/);
        if (cmdMatch && cmdMatch.index !== undefined) {
          const cmdOffset = directive.location.start.offset + cmdMatch.index + cmdMatch[0].indexOf('cmd');
          this.languageHelper.tokenizeLanguageIdentifier('cmd', cmdOffset);
        }

        const openBraceOffset = directiveText.indexOf('{');
        const closeBraceOffset = directiveText.lastIndexOf('}');

        if (openBraceOffset !== -1) {
          this.tokenBuilder.addToken({
            line: directive.location.start.line - 1,
            char: directive.location.start.column - 1 + openBraceOffset,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
        }

        if (closeBraceOffset !== -1) {
          this.tokenBuilder.addToken({
            line: directive.location.start.line - 1,
            char: directive.location.start.column - 1 + closeBraceOffset,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
        }
      }

      // Visit each part of the command (Text and VariableReference nodes)
      const newContext = {
        ...context,
        inCommand: true,
        interpolationAllowed: true,
        variableStyle: '@var' as const
      };

      for (const part of values.command) {
        if (part.type === 'Text' && part.location) {
          // Tokenize text parts as string
          this.tokenBuilder.addToken({
            line: part.location.start.line - 1,
            char: part.location.start.column - 1,
            length: part.content.length,
            tokenType: 'string',
            modifiers: []
          });
        } else if (part.type === 'VariableReference') {
          // Let the main visitor handle variable references
          this.mainVisitor.visitNode(part, newContext);
        } else {
          // Handle any other node types
          this.mainVisitor.visitNode(part, newContext);
        }
      }
      return;
    }

    // For simple tokenization (matching test expectations), tokenize the entire
    // command content as a single string token
    if (directive.location) {
      const sourceText = this.document.getText();
      const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);

      // Handle /run {command} syntax (fallback for non-parsed commands)
      const bracesMatch = directiveText.match(/^\/run\s*\{(.+)\}$/s);
      if (bracesMatch) {
        // Token for opening brace
        const openBraceOffset = directiveText.indexOf('{');
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: directive.location.start.column - 1 + openBraceOffset,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });

        // Token for command content as a single string
        const commandContent = bracesMatch[1];
        const contentStart = openBraceOffset + 1;
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: directive.location.start.column - 1 + contentStart,
          length: commandContent.length,
          tokenType: 'string',
          modifiers: []
        });

        // Highlight @var interpolations inside command content for shell-style runs
        // This is a simple heuristic that finds @identifiers within the braces
        const varRegex = /@[A-Za-z_][A-Za-z0-9_]*/g;
        let match: RegExpExecArray | null;
        while ((match = varRegex.exec(commandContent)) !== null) {
          const varRel = match.index; // relative to contentStart
          this.tokenBuilder.addToken({
            line: directive.location.start.line - 1,
            char: directive.location.start.column - 1 + contentStart + varRel,
            length: match[0].length,
            tokenType: 'variable',
            modifiers: []
          });
        }

        // Token for closing brace
        const closeBraceOffset = directiveText.lastIndexOf('}');
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: directive.location.start.column - 1 + closeBraceOffset,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        return;
      }
      
      // Handle /run "command" syntax
      const quotesMatch = directiveText.match(/^\/run\s*"(.+)"$/s);
      if (quotesMatch) {
        // Token for entire quoted string including quotes
        const quoteStart = directiveText.indexOf('"');
        const quoteEnd = directiveText.lastIndexOf('"');
        const totalLength = quoteEnd - quoteStart + 1;
        
        this.tokenBuilder.addToken({
          line: directive.location.start.line - 1,
          char: directive.location.start.column - 1 + quoteStart,
          length: totalLength,
          tokenType: 'string',
          modifiers: []
        });

        // Highlight @var occurrences inside the quoted command
        const inner = directiveText.substring(quoteStart + 1, quoteEnd);
        const varRegex = /@[A-Za-z_][A-Za-z0-9_]*/g;
        let match: RegExpExecArray | null;
        while ((match = varRegex.exec(inner)) !== null) {
          const varOffset = directive.location.start.column - 1 + quoteStart + 1 + match.index;
          this.tokenBuilder.addToken({
            line: directive.location.start.line - 1,
            char: varOffset,
            length: match[0].length,
            tokenType: 'variable',
            modifiers: []
          });
        }
        return;
      }
    }
    
    if (values?.lang) {
      // For language-specific code blocks, use the language helper
      // (it handles language identifier tokenization internally)
      if (values.code && directive.location) {
        this.languageHelper.tokenizeCodeBlock(directive);
      }
    } else if (values.command && Array.isArray(values.command) && values.command.length > 0) {
      // This is the detailed tokenization path (not used by tests)
      const firstCommand = values.command[0];
      const lastCommand = values.command[values.command.length - 1];
      
      // Use language helper for brace tokenization
      this.languageHelper.tokenizeCommandBraces(firstCommand, lastCommand);
      
      // Process command content
      const newContext = {
        ...context,
        inCommand: true,
        interpolationAllowed: true,
        variableStyle: '@var' as const
      };
      
      // Add the first command part as keyword if it's the command name
      if (values.commandBases && values.commandBases.length > 0) {
        const cmdBase = values.commandBases[0];
        if (cmdBase.location) {
          this.tokenBuilder.addToken({
            line: cmdBase.location.start.line - 1,
            char: cmdBase.location.start.column - 1,
            length: cmdBase.command.length,
            tokenType: 'keyword',
            modifiers: []
          });
        }
      }
      
      // Process remaining parts (skip the command name which we already handled)
      let skipFirst = values.commandBases && values.commandBases.length > 0;
      for (const part of values.command) {
        if (skipFirst && part.content === values.commandBases[0].command) {
          skipFirst = false;
          continue;
        }
        this.mainVisitor.visitNode(part, newContext);
      }
    } else {
      this.visitChildren(values, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
    }

    // Handle withClause if present (for /run with { pipeline: [...] })
    if (values?.withClause) {
      this.visitWithClause(values.withClause, directive, context);
    }

    // Tokenize pipeline operators (| and ||)
    this.tokenizePipelineOperators(directive);

    // Tokenize security labels if present
    this.tokenizeSecurityLabels(directive);
  }

  private visitOutputDirective(directive: any, context: VisitorContext): void {
    const values = directive.values;
    if (!values) return;
    
    // Process source variable
    if (values.source?.identifier) {
      for (const identifier of values.source.identifier) {
        this.mainVisitor.visitNode(identifier, context);
      }
    }
    
    // Token for "to" keyword
    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
    const toMatch = directiveText.match(/\s+to\s+/);
    
    if (toMatch && toMatch.index !== undefined) {
      const toOffset = directive.location.start.offset + toMatch.index + toMatch[0].indexOf('to');
      const toPosition = this.document.positionAt(toOffset);
      
      this.tokenBuilder.addToken({
        line: toPosition.line,
        char: toPosition.character,
        length: 2,
        tokenType: 'keyword',
        modifiers: []
      });
    }
    
    // Process target
    if (values.target) {
      if (values.target.type === 'file' && values.target.path) {
        // File path - tokenize as a single string when quoted; allow interpolation via separate tokens elsewhere
        if (values.target.meta?.quoted && values.target.path) {
          const firstPart = values.target.path[0];
          const lastPart = values.target.path[values.target.path.length - 1];
          if (firstPart?.location && lastPart?.location) {
            const openQuoteOffset = firstPart.location.start.offset - 1; // include opening quote
            const closeQuoteOffset = lastPart.location.end.offset + 1;   // include closing quote
            const length = Math.max(0, closeQuoteOffset - openQuoteOffset);
            const pos = this.document.positionAt(openQuoteOffset);
            this.tokenBuilder.addToken({
              line: pos.line,
              char: pos.character,
              length,
              tokenType: 'string',
              modifiers: []
            });
          }
        } else if (values.target.path) {
          // Unquoted path or variable reference
          for (const pathPart of values.target.path) {
            this.mainVisitor.visitNode(pathPart, context);
          }
        } else if (values.target.raw) {
          // Handle variable references in target (e.g., to @path)
          const targetVarMatch = directiveText.match(/\s+to\s+(@\w+)/);
          if (targetVarMatch && targetVarMatch.index !== undefined) {
            const varOffset = directive.location.start.offset + targetVarMatch.index + targetVarMatch[0].indexOf('@');
            const varPosition = this.document.positionAt(varOffset);
            const varName = targetVarMatch[1];
            
            this.tokenBuilder.addToken({
              line: varPosition.line,
              char: varPosition.character,
              length: varName.length,
              tokenType: 'variable',
              modifiers: []
            });
          }
        }
      } else if (values.target.type === 'stream' && values.target.stream) {
        // Find the position of stdout/stderr
        const streamMatch = directiveText.match(new RegExp(`\\s+(${values.target.stream})(?:\\s|$)`));
        if (streamMatch && streamMatch.index !== undefined) {
          const streamOffset = directive.location.start.offset + streamMatch.index + streamMatch[0].indexOf(values.target.stream);
          const streamPosition = this.document.positionAt(streamOffset);
          
          this.tokenBuilder.addToken({
            line: streamPosition.line,
            char: streamPosition.character,
            length: values.target.stream.length,
            tokenType: 'keyword',
            modifiers: []
          });
        }
      } else if (values.target.type === 'resolver' && values.target.raw) {
        // Handle variable references in target (e.g., to @path)
        const targetVarMatch = directiveText.match(/\s+to\s+(@\w+)/);
        if (targetVarMatch && targetVarMatch.index !== undefined) {
          const varOffset = directive.location.start.offset + targetVarMatch.index + targetVarMatch[0].indexOf('@');
          const varPosition = this.document.positionAt(varOffset);
          const varName = targetVarMatch[1];
          
          this.tokenBuilder.addToken({
            line: varPosition.line,
            char: varPosition.character,
            length: varName.length,
            tokenType: 'variable',
            modifiers: []
          });
        }
      }
    }
    
    // Handle format specifier ("as yaml", etc.)
    if (directive.meta?.format && directive.meta?.explicitFormat) {
      const asMatch = directiveText.match(/\s+as\s+(\w+)/);
      if (asMatch && asMatch.index !== undefined) {
        // Token for "as" keyword
        const asOffset = directive.location.start.offset + asMatch.index + asMatch[0].indexOf('as');
        const asPosition = this.document.positionAt(asOffset);
        
        this.tokenBuilder.addToken({
          line: asPosition.line,
          char: asPosition.character,
          length: 2,
          tokenType: 'keyword',
          modifiers: []
        });
        
        // Token for format name
        const formatOffset = directive.location.start.offset + asMatch.index + asMatch[0].lastIndexOf(asMatch[1]);
        const formatPosition = this.document.positionAt(formatOffset);
        
        this.tokenBuilder.addToken({
          line: formatPosition.line,
          char: formatPosition.character,
          length: asMatch[1].length,
          tokenType: 'keyword',
          modifiers: []
        });
      }
    }
  }
  
  private visitTemplateValue(directive: any, context: VisitorContext): void {
    const wrapperType = directive.meta?.wrapperType;
    // For /exe directives, use template array instead of value
    const values = directive.kind === 'exe' ? (directive.values?.template || []) : (directive.values?.value || []);
    
    
    let templateType: 'backtick' | 'doubleColon' | 'tripleColon' | null = null;
    let variableStyle: '@var' | '{{var}}' = '@var';
    let interpolationAllowed = true;
    let delimiterLength = 1;
    
    switch (wrapperType) {
      case 'backtick':
        templateType = 'backtick';
        delimiterLength = 1;
        break;
      case 'doubleColon':
        templateType = 'doubleColon';
        delimiterLength = 2;
        break;
      case 'tripleColon':
        templateType = 'tripleColon';
        variableStyle = '{{var}}';
        delimiterLength = 3;
        break;
      case 'singleQuote':
        interpolationAllowed = false;
        delimiterLength = 1;
        break;
      case 'doubleQuote':
        // Check if this is a simple string literal (no interpolation)
        if (values.length === 1 && values[0].type === 'Text') {
          // Simple string literal - tokenize as a single string
          if (values[0].location) {
            const startOffset = values[0].location.start.offset - 1; // Include opening quote
            const endOffset = values[0].location.end.offset + 1; // Include closing quote
            const source = this.document.getText();
            const stringContent = source.substring(startOffset, endOffset);
            
            this.tokenBuilder.addToken({
              line: directive.location.start.line - 1,
              char: values[0].location.start.column - 2, // -1 for 0-based, -1 for quote
              length: stringContent.length,
              tokenType: 'string',
              modifiers: []
            });
          }
          return; // Don't process as template
        }
        // Otherwise, it has interpolation
        templateType = 'string';
        interpolationAllowed = true;
        variableStyle = '@var';
        delimiterLength = 1;
        break;
    }
    
    if (templateType && values.length > 0) {
      const firstValue = values[0];
      const lastValue = values[values.length - 1];
      
      
      if (firstValue?.location) {
        // Calculate delimiter position more safely
        const sourceText = this.document.getText();
        const nodeText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
        
        // Find the actual delimiter position
        let delimiterChar = '';
        if (templateType === 'backtick') delimiterChar = '`';
        else if (templateType === 'doubleColon') delimiterChar = '::';
        else if (templateType === 'tripleColon') delimiterChar = ':::';
        
        if (delimiterChar && (templateType === 'backtick' || templateType === 'doubleColon' || templateType === 'tripleColon')) {
          // Find the opening delimiter in the directive text
          const delimiterIndex = nodeText.lastIndexOf(delimiterChar, firstValue.location.start.offset - directive.location.start.offset);
          if (delimiterIndex !== -1) {
            const delimiterPosition = this.document.positionAt(directive.location.start.offset + delimiterIndex);
            this.tokenBuilder.addToken({
              line: delimiterPosition.line,
              char: delimiterPosition.character,
              length: delimiterLength,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      }
      
      const newContext = {
        ...context,
        templateType: templateType as any,
        interpolationAllowed,
        variableStyle,
        inSingleQuotes: wrapperType === 'singleQuote',
        wrapperType: wrapperType as any
      };

      for (const node of values) {
        this.mainVisitor.visitNode(node, newContext);
      }
      
      if (lastValue?.location && (templateType === 'backtick' || templateType === 'doubleColon' || templateType === 'tripleColon')) {
        // Find the closing delimiter
        const sourceText = this.document.getText();
        const nodeText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
        
        let delimiterChar = '';
        if (templateType === 'backtick') delimiterChar = '`';
        else if (templateType === 'doubleColon') delimiterChar = '::';
        else if (templateType === 'tripleColon') delimiterChar = ':::';
        
        if (delimiterChar) {
          // Find the closing delimiter after the last value
          const searchStart = lastValue.location.end.offset - directive.location.start.offset;
          const delimiterIndex = nodeText.indexOf(delimiterChar, searchStart);
          if (delimiterIndex !== -1) {
            const delimiterPosition = this.document.positionAt(directive.location.start.offset + delimiterIndex);
            this.tokenBuilder.addToken({
              line: delimiterPosition.line,
              char: delimiterPosition.character,
              length: delimiterLength,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      }
    }
  }
  
  private visitInlineCode(directive: any, context: VisitorContext): void {
    const values = directive.values;
    
    // Handle different code structures:
    // 1. /var with values.value[0].type === 'code'
    // 2. /exe with values.code and directive.raw.lang
    const codeNode = values.code || 
                    (Array.isArray(values.value) && values.value[0]?.type === 'code' ? values.value[0] : null);
    
    // Use the language helper for inline code tokenization
    this.languageHelper.tokenizeInlineCode(directive, codeNode);
  }
  
  private handlePrimitiveValue(value: any, directive: any): void {
    const source = this.document.getText();
    const directiveText = source.substring(directive.location.start.offset, directive.location.end.offset);
    const equalIndex = directiveText.indexOf('=');
    
    if (equalIndex === -1) return;
    
    const afterEqual = directiveText.substring(equalIndex + 1).trimStart();
    const valueStart = directive.location.start.column + equalIndex + 1 + (directiveText.length - equalIndex - 1 - afterEqual.length);
    
    let tokenType = 'string';
    let modifiers: string[] = [];
    let tokenLength = 0;
    
    if (typeof value === 'number') {
      tokenType = 'number';
      tokenLength = String(value).length;
    } else if (typeof value === 'boolean') {
      tokenType = 'boolean';
      tokenLength = String(value).length;
    } else if (value === null) {
      tokenType = 'null';
      tokenLength = 4;
    } else if (typeof value === 'string') {
      const quotedLength = afterEqual.indexOf(afterEqual[0], 1) + 1;
      tokenLength = quotedLength;
      
      if (afterEqual.startsWith("'")) {
        modifiers.push('literal');
      }
    }
    
    this.tokenBuilder.addToken({
      line: directive.location.start.line - 1,
      char: valueStart - 1,
      length: tokenLength,
      tokenType,
      modifiers
    });
  }
  
  private visitWhenDirective(node: any, context: VisitorContext): void {
    if (node.values) {
      // Handle simple when form: /when @condition => action
      if (node.values.condition && node.values.action) {
        // Process condition
        if (Array.isArray(node.values.condition)) {
          for (const cond of node.values.condition) {
            this.mainVisitor.visitNode(cond, context);
          }
        } else {
          this.mainVisitor.visitNode(node.values.condition, context);
        }
        
        // Find and add => operator
        const conditionEnd = Array.isArray(node.values.condition)
          ? node.values.condition[node.values.condition.length - 1].location?.end
          : node.values.condition.location?.end;
        const actionStart = Array.isArray(node.values.action)
          ? node.values.action[0].location?.start
          : node.values.action.location?.start;
          
        if (conditionEnd && actionStart) {
          this.operatorHelper.tokenizeOperatorBetween(
            conditionEnd.offset,
            actionStart.offset,
            '=>',
            'modifier'
          );
        }
        
        // Process action
        if (Array.isArray(node.values.action)) {
          for (const action of node.values.action) {
            this.mainVisitor.visitNode(action, context);
          }
        } else {
          this.mainVisitor.visitNode(node.values.action, context);
        }
        return;
      }
      
      // Handle block form: /when @var: [...] or /when @var first: [...] or bare /when [...]
      if (node.values.conditions && Array.isArray(node.values.conditions)) {
        // Handle bare when form: /when [...] 
        if (!node.values.variable && !node.values.expression && !node.values.modifier) {
          // For bare form, find and tokenize the opening bracket after /when
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          
          // Find the opening bracket after /when (use enum for dim structural color)
          const bracketMatch = nodeText.match(/^\/when\s*(\[)/);
          if (bracketMatch && bracketMatch.index !== undefined) {
            const bracketOffset = bracketMatch[0].indexOf('[');
            const bracketPosition = this.document.positionAt(node.location.start.offset + bracketOffset);

            this.tokenBuilder.addToken({
              line: bracketPosition.line,
              char: bracketPosition.character,
              length: 1,
              tokenType: 'enum',
              modifiers: []
            });
          }
        }
        
        if (node.values.variable) {
          // The variable location is often wrong in the AST, so we need to find it manually
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          
          // Extract the variable identifier
          let varIdentifier = '';
          if (Array.isArray(node.values.variable) && node.values.variable[0]) {
            varIdentifier = node.values.variable[0].identifier || '';
          } else if (node.values.variable && node.values.variable.identifier) {
            varIdentifier = node.values.variable.identifier;
          }
          
          if (varIdentifier) {
            // Find the @ symbol followed by the identifier after /when
            const varPattern = new RegExp(`\\s+@${varIdentifier}(?=\\s|:|$)`);
            const match = nodeText.match(varPattern);
            
            if (match && match.index !== undefined) {
              const varOffset = match.index + match[0].indexOf('@');
              const varPosition = this.document.positionAt(node.location.start.offset + varOffset);
              
              // Add variable token
              this.tokenBuilder.addToken({
                line: varPosition.line,
                char: varPosition.character,
                length: varIdentifier.length + 1, // +1 for @
                tokenType: 'variable',
                modifiers: []
              });
            }
          }
        }
        
        // Handle expression in /when @var: pattern
        if (node.values.expression) {
          if (Array.isArray(node.values.expression)) {
            for (const expr of node.values.expression) {
              this.mainVisitor.visitNode(expr, context);
            }
          } else {
            this.mainVisitor.visitNode(node.values.expression, context);
          }
          
          // Add colon token after expression
          const sourceText = this.document.getText();
          const exprEnd = Array.isArray(node.values.expression) 
            ? node.values.expression[node.values.expression.length - 1].location?.end
            : node.values.expression.location?.end;
            
          if (exprEnd) {
            const afterExpr = sourceText.substring(exprEnd.offset, exprEnd.offset + 5);
            const colonIndex = afterExpr.indexOf(':');
            if (colonIndex !== -1) {
              this.tokenBuilder.addToken({
                line: exprEnd.line - 1,
                char: exprEnd.column - 1 + colonIndex,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
              
              // Look for opening bracket after colon (use enum for dim structural color)
              const afterColon = afterExpr.substring(colonIndex + 1);
              const openBracketIndex = afterColon.search(/\[/);
              if (openBracketIndex !== -1) {
                this.tokenBuilder.addToken({
                  line: exprEnd.line - 1,
                  char: exprEnd.column - 1 + colonIndex + 1 + openBracketIndex,
                  length: 1,
                  tokenType: 'enum',
                  modifiers: []
                });
              }
            }
          }
        }
        
        // Handle pattern modifier (first:, all:, any:)
        if (node.values.modifier && Array.isArray(node.values.modifier) && node.values.modifier.length > 0) {
          const modifierText = node.values.modifier[0];
          if (process.env.DEBUG_LSP || this.document.uri.includes('test-syntax')) {
            console.log('[PATTERN-MOD] Found modifier:', modifierText);
          }
          if (modifierText.type === 'Text' && modifierText.content) {
            // Need to find the actual position of the modifier in the source text
            const sourceText = this.document.getText();
            const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
            
            // Find variable end position
            let searchStart = 0;
            // Since variable location is often wrong, find it manually
            const varMatch = nodeText.match(/\s+@\w+/);
            if (varMatch && varMatch.index !== undefined) {
              searchStart = varMatch.index + varMatch[0].length;
            } else {
              // If no variable, start after /when
              searchStart = 5; // length of "/when"
            }
            
            // Look for the modifier text followed by a colon
            const modifierPattern = new RegExp(`\\s+(${modifierText.content})\\s*:`);
            const match = nodeText.substring(searchStart).match(modifierPattern);
            
            if (match && match.index !== undefined) {
              const modifierOffset = searchStart + match.index + match[0].indexOf(modifierText.content);
              const modifierPosition = this.document.positionAt(node.location.start.offset + modifierOffset);
              
              this.tokenBuilder.addToken({
                line: modifierPosition.line,
                char: modifierPosition.character,
                length: modifierText.content.length,
                tokenType: 'keyword',
                modifiers: []
              });
              
              // Also add the colon after the modifier
              const colonOffset = modifierOffset + modifierText.content.length;
              const colonMatch = nodeText.substring(colonOffset).match(/^\s*:/);
              if (colonMatch) {
                const colonPosition = this.document.positionAt(node.location.start.offset + colonOffset + colonMatch.index! + colonMatch[0].indexOf(':'));
                this.tokenBuilder.addToken({
                  line: colonPosition.line,
                  char: colonPosition.character,
                  length: 1,
                  tokenType: 'operator',
                  modifiers: []
                });
                
                // Look for opening bracket after the pattern modifier's colon (use enum for dim structural color)
                const afterColon = nodeText.substring(colonOffset + colonMatch[0].length);
                const openBracketMatch = afterColon.match(/^\s*\[/);
                if (openBracketMatch) {
                  const bracketOffset = colonOffset + colonMatch[0].length + openBracketMatch.index! + openBracketMatch[0].indexOf('[');
                  const bracketPosition = this.document.positionAt(node.location.start.offset + bracketOffset);
                  this.tokenBuilder.addToken({
                    line: bracketPosition.line,
                    char: bracketPosition.character,
                    length: 1,
                    tokenType: 'enum',
                    modifiers: []
                  });
                }
              }
            }
          }
        } else if (node.raw?.modifier || node.meta?.modifier) {
          // Fallback to raw/meta modifier if available
          const modifierText = node.raw?.modifier || node.meta?.modifier;
          if (process.env.DEBUG_LSP || this.document.uri.includes('test-syntax')) {
            console.log('[PATTERN-MOD] Using raw/meta modifier:', modifierText);
          }
          const sourceText = this.document.getText();
          const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
          
          // Find variable end position
          let searchStart = 0;
          // Since variable location is often wrong, find it manually
          const varMatch = nodeText.match(/\s+@\w+/);
          if (varMatch && varMatch.index !== undefined) {
            searchStart = varMatch.index + varMatch[0].length;
          } else {
            // If no variable, start after /when
            searchStart = 5; // length of "/when"
          }
          
          // Look for the modifier text followed by a colon
          const modifierPattern = new RegExp(`\\s+(${modifierText})\\s*:`);
          const match = nodeText.substring(searchStart).match(modifierPattern);
          
          if (match && match.index !== undefined) {
            const modifierOffset = searchStart + match.index + match[0].indexOf(modifierText);
            const modifierPosition = this.document.positionAt(node.location.start.offset + modifierOffset);
            
            this.tokenBuilder.addToken({
              line: modifierPosition.line,
              char: modifierPosition.character,
              length: modifierText.length,
              tokenType: 'keyword',
              modifiers: []
            });
            
            // Also add the colon after the modifier
            const colonOffset = modifierOffset + modifierText.length;
            const colonMatch = nodeText.substring(colonOffset).match(/^\s*:/);
            if (colonMatch) {
              const colonPosition = this.document.positionAt(node.location.start.offset + colonOffset + colonMatch.index! + colonMatch[0].indexOf(':'));
              this.tokenBuilder.addToken({
                line: colonPosition.line,
                char: colonPosition.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
              
              // Look for opening bracket after the pattern modifier's colon
              const afterColon = nodeText.substring(colonOffset + colonMatch[0].length);
              const openBracketMatch = afterColon.match(/^\s*\[/);
              if (openBracketMatch) {
                const bracketOffset = colonOffset + colonMatch[0].length + openBracketMatch.index! + openBracketMatch[0].indexOf('[');
                const bracketPosition = this.document.positionAt(node.location.start.offset + bracketOffset);
                this.tokenBuilder.addToken({
                  line: bracketPosition.line,
                  char: bracketPosition.character,
                  length: 1,
                  tokenType: 'operator',
                  modifiers: []
                });
              }
            }
          }
        } else {
          // For simple when blocks without pattern modifier, just add colon after variable
          if (node.values.variable && Array.isArray(node.values.variable) && node.values.variable[0]?.location) {
            const varEnd = node.values.variable[0].location.end;
            const sourceText = this.document.getText();
            const afterVar = sourceText.substring(varEnd.offset, varEnd.offset + 5);
            const colonIndex = afterVar.indexOf(':');
            if (colonIndex !== -1) {
              const colonPosition = this.document.positionAt(varEnd.offset + colonIndex);
              this.tokenBuilder.addToken({
                line: colonPosition.line,
                char: colonPosition.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }
          }
        }
        
        // Note: Opening bracket is already handled in the expression/colon handling code above

        for (let i = 0; i < node.values.conditions.length; i++) {
          const pair = node.values.conditions[i];

          if (pair.pattern && pair.patternLocation) {
            this.tokenBuilder.addToken({
              line: pair.patternLocation.start.line - 1,
              char: pair.patternLocation.start.column - 1,
              length: pair.pattern.length,
              tokenType: 'keyword',
              modifiers: []
            });
          }

          if (pair.condition) {
            if (Array.isArray(pair.condition)) {
              for (const cond of pair.condition) {
                this.mainVisitor.visitNode(cond, context);
              }
            } else {
              this.mainVisitor.visitNode(pair.condition, context);
            }
          }

          // Handle arrow operator
          if (pair.arrowLocation) {
            this.tokenBuilder.addToken({
              line: pair.arrowLocation.start.line - 1,
              char: pair.arrowLocation.start.column - 1,
              length: 2,
              tokenType: 'modifier',
              modifiers: []
            });
          } else if (pair.condition && pair.action) {
            // For bare form without explicit arrowLocation, find => between condition and action
            const conditionEnd = Array.isArray(pair.condition)
              ? pair.condition[pair.condition.length - 1].location?.end
              : pair.condition.location?.end;
            const actionStart = Array.isArray(pair.action)
              ? pair.action[0].location?.start
              : pair.action.location?.start;

            if (conditionEnd && actionStart) {
              this.operatorHelper.tokenizeOperatorBetween(
                conditionEnd.offset,
                actionStart.offset,
                '=>',
                'modifier'
              );
            }
          }

          if (pair.action) {
            if (Array.isArray(pair.action)) {
              for (const action of pair.action) {
                this.mainVisitor.visitNode(action, context);
              }
            } else {
              this.mainVisitor.visitNode(pair.action, context);
            }
          }

          // Tokenize semicolon between arms (not after the last arm)
          if (i < node.values.conditions.length - 1) {
            const currentPair = node.values.conditions[i];
            const nextPair = node.values.conditions[i + 1];

            // Find the end of the current action
            const currentActionEnd = Array.isArray(currentPair.action)
              ? currentPair.action[currentPair.action.length - 1]?.location?.end
              : currentPair.action?.location?.end;

            // Find the start of the next condition
            const nextConditionStart = Array.isArray(nextPair.condition)
              ? nextPair.condition[0]?.location?.start
              : nextPair.condition?.location?.start;

            if (currentActionEnd && nextConditionStart) {
              this.operatorHelper.tokenizeOperatorBetween(
                currentActionEnd.offset,
                nextConditionStart.offset,
                ';'
              );
            }
          }
        }
        
        // Add closing bracket after processing all conditions
        if (node.values.conditions.length > 0 && node.location) {
          const sourceText = this.document.getText();
          const directiveText = sourceText.substring(
            node.location.start.offset,
            node.location.end.offset
          );
          const closeBracketIndex = directiveText.lastIndexOf(']');
          if (closeBracketIndex !== -1) {
            // Calculate absolute position of the closing bracket
            const absolutePosition = this.document.positionAt(node.location.start.offset + closeBracketIndex);
            this.tokenBuilder.addToken({
              line: absolutePosition.line,
              char: absolutePosition.character,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
        
        // Handle action for when blocks (after ] =>)
        if (node.values.action) {
          // Find and tokenize => operator
          const sourceText = this.document.getText();
          const directiveText = sourceText.substring(
            node.location.start.offset,
            node.location.end.offset
          );
          const closeBracketIndex = directiveText.lastIndexOf(']');
          if (closeBracketIndex !== -1) {
            const afterBracket = directiveText.substring(closeBracketIndex + 1);
            const arrowIndex = afterBracket.indexOf('=>');
            if (arrowIndex !== -1) {
              const arrowPosition = this.document.positionAt(
                node.location.start.offset + closeBracketIndex + 1 + arrowIndex
              );
              this.tokenBuilder.addToken({
                line: arrowPosition.line,
                char: arrowPosition.character,
                length: 2,
                tokenType: 'modifier',
                modifiers: []
              });
            }
          }
          
          // Process the action
          if (Array.isArray(node.values.action)) {
            for (const action of node.values.action) {
              this.mainVisitor.visitNode(action, context);
            }
          } else {
            this.mainVisitor.visitNode(node.values.action, context);
          }
        }
      } else if (node.values.condition) {
        if (Array.isArray(node.values.condition)) {
          for (const cond of node.values.condition) {
            this.mainVisitor.visitNode(cond, context);
          }
        } else {
          this.mainVisitor.visitNode(node.values.condition, context);
        }
        
        if (node.values.action) {
          const conditionEnd = Array.isArray(node.values.condition) 
            ? node.values.condition[node.values.condition.length - 1].location?.end 
            : node.values.condition.location?.end;
          const actionStart = Array.isArray(node.values.action)
            ? node.values.action[0].location?.start
            : node.values.action.location?.start;
            
          if (conditionEnd && actionStart) {
            // Find the arrow operator between condition and action
            this.operatorHelper.tokenizeOperatorBetween(
              conditionEnd.offset,
              actionStart.offset,
              '=>',
              'modifier'
            );
          }
        }
        
        if (node.values.action) {
          if (Array.isArray(node.values.action)) {
            // Handle block delimiters for array actions
            const sourceText = this.document.getText();
            const directiveText = sourceText.substring(
              node.location.start.offset,
              node.location.end.offset
            );
            
            // Find and tokenize => operator
            const arrowIndex = directiveText.indexOf('=>');
            if (arrowIndex !== -1) {
              // Tokenize => operator
              const arrowPosition = this.document.positionAt(
                node.location.start.offset + arrowIndex
              );
              this.tokenBuilder.addToken({
                line: arrowPosition.line,
                char: arrowPosition.character,
                length: 2,
                tokenType: 'modifier',
                modifiers: []
              });

              // Find opening bracket after =>
              const afterArrow = directiveText.substring(arrowIndex + 2);
              const openBracketIndex = afterArrow.search(/\[/);

              if (openBracketIndex !== -1) {
                // Add opening bracket token
                this.tokenBuilder.addToken({
                  line: node.location.start.line - 1,
                  char: node.location.start.column + arrowIndex + 2 + openBracketIndex - 1,
                  length: 1,
                  tokenType: 'enum',
                  modifiers: []
                });
              }
            }
            
            // Visit each action
            for (const action of node.values.action) {
              this.mainVisitor.visitNode(action, context);
            }
            
            // Find closing bracket position (use enum for dim structural color)
            const closeBracketIndex = directiveText.lastIndexOf(']');
            if (closeBracketIndex !== -1) {
              // Calculate the actual line and column for the closing bracket
              const linesBeforeBracket = directiveText.substring(0, closeBracketIndex).split('\n');
              const bracketLine = node.location.start.line + linesBeforeBracket.length - 2;
              const bracketColumn = linesBeforeBracket.length > 1
                ? linesBeforeBracket[linesBeforeBracket.length - 1].length
                : node.location.start.column + closeBracketIndex - 1;

              this.tokenBuilder.addToken({
                line: bracketLine,
                char: bracketColumn,
                length: 1,
                tokenType: 'enum',
                modifiers: []
              });
            }
          } else {
            this.mainVisitor.visitNode(node.values.action, context);
          }
        }
      }
    }

    // Handle end-of-line comments in when directives
    if (node.meta?.comment) {
      this.visitEndOfLineComment(node.meta.comment);
    }
  }

  private visitImportDirective(directive: any, context: VisitorContext): void {
    const values = directive.values;
    if (!values || !directive.location) return;
    
    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
    
    // Handle import items (selected imports)
    if (values.imports && Array.isArray(values.imports)) {
      // Find and tokenize opening brace
      const openBraceMatch = directiveText.match(/^\s*\/import\s*(\{)/);
      if (openBraceMatch && openBraceMatch.index !== undefined) {
        const braceOffset = directive.location.start.offset + openBraceMatch[0].indexOf('{');
        const bracePosition = this.document.positionAt(braceOffset);
        
        this.tokenBuilder.addToken({
          line: bracePosition.line,
          char: bracePosition.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
      }
      
      // Tokenize each import item
      for (let i = 0; i < values.imports.length; i++) {
        const importItem = values.imports[i];
        if (importItem?.identifier && importItem?.location) {
          this.tokenBuilder.addToken({
            line: importItem.location.start.line - 1,
            char: importItem.location.start.column - 1,
            length: (importItem.identifier.length || 0) + 1,
            tokenType: 'variable',
            modifiers: []
          });
        }
        
        // Tokenize comma between items
        if (i < values.imports.length - 1 && importItem?.location && values.imports[i + 1]?.location) {
          const nextItem = values.imports[i + 1];
          const afterItem = sourceText.substring(importItem.location.end.offset, nextItem.location.start.offset);
          const commaIndex = afterItem.indexOf(',');
          if (commaIndex !== -1) {
            const commaOffset = importItem.location.end.offset + commaIndex;
            const commaPosition = this.document.positionAt(commaOffset);
            
            this.tokenBuilder.addToken({
              line: commaPosition.line,
              char: commaPosition.character,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      }
      
      // Find and tokenize closing brace
      const closeBraceMatch = directiveText.match(/\}/);
      if (closeBraceMatch && closeBraceMatch.index !== undefined) {
        const closeBraceOffset = directive.location.start.offset + closeBraceMatch.index;
        const closeBracePosition = this.document.positionAt(closeBraceOffset);
        
        this.tokenBuilder.addToken({
          line: closeBracePosition.line,
          char: closeBracePosition.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
      }
    }
    
    // Tokenize "from" keyword
    const fromMatch = directiveText.match(/\s+from\s+/);
    if (fromMatch && fromMatch.index !== undefined) {
      const fromOffset = directive.location.start.offset + fromMatch.index + fromMatch[0].indexOf('from');
      const fromPosition = this.document.positionAt(fromOffset);
      
      this.tokenBuilder.addToken({
        line: fromPosition.line,
        char: fromPosition.character,
        length: 4,
        tokenType: 'keyword',
        modifiers: []
      });
    }
    
    // Handle import source (path or namespace)
    if (values.path && Array.isArray(values.path) && values.path.length > 0) {
      const pathNode = values.path[0];
      
      if (directive.meta?.path?.isModule) {
        // Module import like @mlld/github or @corp/utils
        // Parse the module path to handle multi-segment paths
        const fullPath = pathNode?.content || '';
        const parts = fullPath.split('/');
        
        if (process.env.DEBUG_LSP === 'true') {
          console.log('[IMPORT-MODULE]', {
            fullPath,
            parts,
            directiveText,
            pathNode: pathNode?.content
          });
        }
        
        if (parts.length >= 2 && parts[0].startsWith('@')) {
          // Find the start position of the module path
          const moduleStartMatch = directiveText.indexOf(fullPath);
          if (moduleStartMatch !== -1) {
            const moduleStartOffset = directive.location.start.offset + moduleStartMatch;
            const moduleStartPosition = this.document.positionAt(moduleStartOffset);
            
            if (process.env.DEBUG_LSP === 'true') {
              console.log('[IMPORT-TOKEN-MODULE]', {
                line: moduleStartPosition.line,
                char: moduleStartPosition.character,
                length: fullPath.length,
                fullPath
              });
            }
            
            // Try highlighting the entire module path as one token
            // This might work better for visibility
            this.tokenBuilder.addToken({
              line: moduleStartPosition.line,
              char: moduleStartPosition.character,
              length: fullPath.length,
              tokenType: 'variable',
              modifiers: ['defaultLibrary']
            });
          }
        }
      } else if (pathNode?.content === '@input') {
        // Special @input source
        const inputMatch = directiveText.match(/@input/);
        if (inputMatch && inputMatch.index !== undefined) {
          const inputOffset = directive.location.start.offset + inputMatch.index;
          const inputPosition = this.document.positionAt(inputOffset);
          
          this.tokenBuilder.addToken({
            line: inputPosition.line,
            char: inputPosition.character,
            length: 6, // @input
            tokenType: 'keyword',
            modifiers: []
          });
        }
      } else if (pathNode.type === 'Text' && pathNode.content?.startsWith('@')) {
        // WORKAROUND: Grammar bug - special resolvers like @payLoad parsed as Text, not VariableReference
        // TODO: Fix grammar to parse as VariableReference
        this.tokenBuilder.addToken({
          line: pathNode.location.start.line - 1,
          char: pathNode.location.start.column - 1,
          length: pathNode.content.length,
          tokenType: 'variable',
          modifiers: ['readonly']
        });
      } else {
        // File path - can be alligator <...> or quoted "..."
        // Check if this is alligator syntax
        const alligatorMatch = directiveText.match(/<[^>]+>/);

        if (alligatorMatch && alligatorMatch.index !== undefined) {
          // Alligator path like <@base/file.md> or <test.md>
          const openBracketOffset = directive.location.start.offset + alligatorMatch.index;
          const openBracketPosition = this.document.positionAt(openBracketOffset);

          // Token for "<"
          this.tokenBuilder.addToken({
            line: openBracketPosition.line,
            char: openBracketPosition.character,
            length: 1,
            tokenType: 'alligatorOpen',
            modifiers: []
          });

          // Process each path node (VariableReference, Text, PathSeparator)
          for (const node of values.path) {
            if (node.type === 'VariableReference' && node.valueType === 'varIdentifier' && node.location) {
              // Variable like @base - highlight as variable (light blue)
              this.tokenBuilder.addToken({
                line: node.location.start.line - 1,
                char: node.location.start.column - 1,
                length: node.identifier.length + 1, // +1 for @
                tokenType: 'variable',
                modifiers: []
              });
            } else if (node.type === 'Text' && node.location && node.content) {
              // Text content like "file.md" - highlight as alligator (light teal)
              this.tokenBuilder.addToken({
                line: node.location.start.line - 1,
                char: node.location.start.column - 1,
                length: node.content.length,
                tokenType: 'alligator',
                modifiers: []
              });
            } else if (node.type === 'PathSeparator' && node.location) {
              // Path separator "/" - highlight as operator
              this.tokenBuilder.addToken({
                line: node.location.start.line - 1,
                char: node.location.start.column - 1,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }
          }

          // Token for ">"
          const closeBracketOffset = openBracketOffset + alligatorMatch[0].length - 1;
          const closeBracketPosition = this.document.positionAt(closeBracketOffset);
          this.tokenBuilder.addToken({
            line: closeBracketPosition.line,
            char: closeBracketPosition.character,
            length: 1,
            tokenType: 'alligatorClose',
            modifiers: []
          });
        } else {
          // Quoted path
          // Check if this is a simple string or contains variables
          const hasVariables = values.path.some(node =>
            node.type === 'VariableReference' && node.valueType === 'varIdentifier'
          );

          if (hasVariables) {
            // Complex path with variables like "@base/something.mld"
            // First, find the opening quote
            const quoteMatch = directiveText.match(/from\s+("[^"]*")/);
            if (quoteMatch && quoteMatch.index !== undefined) {
            const quoteOffset = directive.location.start.offset + quoteMatch.index + quoteMatch[0].indexOf('"');
            const quotePosition = this.document.positionAt(quoteOffset);
            
            // Token for opening quote
            this.tokenBuilder.addToken({
              line: quotePosition.line,
              char: quotePosition.character,
              length: 1,
              tokenType: 'string',
              modifiers: []
            });
            
            // Process each path node
            for (let i = 0; i < values.path.length; i++) {
              const node = values.path[i];
              if (node.type === 'VariableReference' && node.valueType === 'varIdentifier') {
                // Variable within the string like @base
                this.tokenBuilder.addToken({
                  line: node.location.start.line - 1,
                  char: node.location.start.column - 1,
                  length: node.identifier.length + 1, // +1 for @
                  tokenType: 'variable',
                  modifiers: []
                });
              } else if (node.type === 'Text' && node.location) {
                // Text content within the string
                this.tokenBuilder.addToken({
                  line: node.location.start.line - 1,
                  char: node.location.start.column - 1,
                  length: node.content.length,
                  tokenType: 'string',
                  modifiers: []
                });
              }
            }
            
            // Token for closing quote
            const closingQuoteMatch = directiveText.match(/from\s+"[^"]*"/);
            if (closingQuoteMatch) {
              const fullMatch = closingQuoteMatch[0];
              const closingQuoteOffset = directive.location.start.offset + directiveText.indexOf(fullMatch) + fullMatch.length - 1;
              const closingQuotePosition = this.document.positionAt(closingQuoteOffset);
              
              this.tokenBuilder.addToken({
                line: closingQuotePosition.line,
                char: closingQuotePosition.character,
                length: 1,
                tokenType: 'string',
                modifiers: []
              });
            }
          }
          } else {
            // Simple string path like "shared.mld" - tokenize as one unit
            const stringMatch = directiveText.match(/from\s+("[^"]*")/);
            if (stringMatch && stringMatch.index !== undefined) {
              const stringOffset = directive.location.start.offset + stringMatch.index + stringMatch[0].indexOf('"');
              const stringPosition = this.document.positionAt(stringOffset);

              this.tokenBuilder.addToken({
                line: stringPosition.line,
                char: stringPosition.character,
                length: stringMatch[1].length, // includes both quotes
                tokenType: 'string',
                modifiers: []
              });
            }
          }
        }
      }
    }
    
    // Handle import type identifier (e.g., "templates" in: import templates from "...")
    if (directive.raw?.importType && directive.subtype === 'importNamespace') {
      const importTypeMatch = directiveText.match(/import\s+(\w+)\s+from/);
      if (importTypeMatch && importTypeMatch[1]) {
        const typeOffset = directive.location.start.offset + importTypeMatch.index + importTypeMatch[0].indexOf(importTypeMatch[1]);
        const typePosition = this.document.positionAt(typeOffset);

        this.tokenBuilder.addToken({
          line: typePosition.line,
          char: typePosition.character,
          length: importTypeMatch[1].length,
          tokenType: 'type',
          modifiers: []
        });
      }
    }

    // Handle "as" alias
    if (directive.subtype === 'importNamespace' && values.namespace) {
      const asMatch = directiveText.match(/\s+as\s+/);
      if (asMatch && asMatch.index !== undefined) {
        // Token for "as" keyword
        const asOffset = directive.location.start.offset + asMatch.index + asMatch[0].indexOf('as');
        const asPosition = this.document.positionAt(asOffset);

        this.tokenBuilder.addToken({
          line: asPosition.line,
          char: asPosition.character,
          length: 2,
          tokenType: 'keyword',
          modifiers: []
        });

        // Token for alias name @agentTemplates (Text node has content without @)
        const namespaceNode = Array.isArray(values.namespace) ? values.namespace[0] : values.namespace;
        if (namespaceNode && namespaceNode.location) {
          const aliasName = namespaceNode.content || directive.raw?.namespace?.slice(1); // Remove @ from raw
          if (aliasName) {
            // Find @ before the alias name
            const atMatch = directiveText.match(/as\s+(@\w+)/);
            if (atMatch && atMatch.index !== undefined) {
              const aliasOffset = directive.location.start.offset + atMatch.index + atMatch[0].indexOf('@');
              const aliasPosition = this.document.positionAt(aliasOffset);

              this.tokenBuilder.addToken({
                line: aliasPosition.line,
                char: aliasPosition.character,
                length: aliasName.length + 1, // +1 for @
                tokenType: 'variable',
                modifiers: []
              });
            }
          }
        }

        // Token for template parameters if present
        if (directive.raw?.templateParams && Array.isArray(directive.raw.templateParams)) {
          const paramsMatch = directiveText.match(/@\w+\(([^)]+)\)/);
          if (paramsMatch && paramsMatch[1]) {
            const params = paramsMatch[1].split(',').map(p => p.trim());
            let searchStart = directive.location.start.offset + paramsMatch.index + paramsMatch[0].indexOf('(') + 1;

            for (const param of params) {
              const paramOffset = this.document.getText().indexOf(param, searchStart);
              if (paramOffset !== -1) {
                const paramPosition = this.document.positionAt(paramOffset);
                this.tokenBuilder.addToken({
                  line: paramPosition.line,
                  char: paramPosition.character,
                  length: param.length,
                  tokenType: 'parameter',
                  modifiers: []
                });
                searchStart = paramOffset + param.length;
              }
            }
          }
        }
      }
    }
  }
  
  private visitForDirective(directive: any, context: VisitorContext): void {
    const values = directive.values;
    if (!values || !directive.location) return;
    
    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);
    
    // Tokenize optional parallel keyword and its argument
    const parallelMatch = directiveText.match(/\bparallel\b/);
    if (parallelMatch && parallelMatch.index !== undefined) {
      const parOffset = directive.location.start.offset + parallelMatch.index;
      const parPos = this.document.positionAt(parOffset);
      this.tokenBuilder.addToken({
        line: parPos.line,
        char: parPos.character,
        length: 'parallel'.length,
        tokenType: 'label',
        modifiers: []
      });

      // Check for parallel(n) syntax - number after parallel
      const afterParallel = directiveText.substring(parallelMatch.index + 'parallel'.length);
      const argMatch = afterParallel.match(/^\s*\((\d+)\)/);
      if (argMatch) {
        const openParenOffset = parOffset + 'parallel'.length + afterParallel.indexOf('(');
        const closeParenOffset = openParenOffset + argMatch[0].indexOf(')');
        const numberOffset = openParenOffset + 1;

        // '('
        this.operatorHelper.addOperatorToken(openParenOffset, 1);

        // number
        const numPos = this.document.positionAt(numberOffset);
        this.tokenBuilder.addToken({
          line: numPos.line,
          char: numPos.character,
          length: argMatch[1].length,
          tokenType: 'number',
          modifiers: []
        });

        // ')'
        this.operatorHelper.addOperatorToken(closeParenOffset, 1);
      }
    }

    // Pacing tuple: (n, interval) parallel - legacy syntax
    const pacingMatch = directiveText.match(/\(([\s\d,smhd]+)\)\s*parallel/);
    if (pacingMatch && pacingMatch.index !== undefined) {
      const openOffset = directive.location.start.offset + pacingMatch.index;
      const closeOffset = openOffset + pacingMatch[0].indexOf(')');
      // '('
      this.operatorHelper.addOperatorToken(openOffset, 1);
      // numbers inside
      const inner = pacingMatch[1];
      const innerStart = openOffset + 1;
      // crude scan for numbers and comma
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (/\d/.test(ch)) {
          let j = i;
          while (j < inner.length && /\d/.test(inner[j])) j++;
          const numPos = this.document.positionAt(innerStart + i);
          this.tokenBuilder.addToken({
            line: numPos.line,
            char: numPos.character,
            length: j - i,
            tokenType: 'number',
            modifiers: []
          });
          i = j - 1;
          continue;
        }
        if (ch === ',') {
          this.operatorHelper.addOperatorToken(innerStart + i, 1);
        }
      }
      // ')'
      if (closeOffset >= openOffset) this.operatorHelper.addOperatorToken(closeOffset, 1);
    }
    
    // Process variable
    if (values.variable && Array.isArray(values.variable)) {
      for (const varNode of values.variable) {
        this.mainVisitor.visitNode(varNode, context);
      }
    }
    
    // Find and tokenize "in" keyword
    const inMatch = directiveText.match(/\s+in\s+/);
    if (inMatch && inMatch.index !== undefined) {
      const inOffset = directive.location.start.offset + inMatch.index + inMatch[0].indexOf('in');
      const inPosition = this.document.positionAt(inOffset);
      
      this.tokenBuilder.addToken({
        line: inPosition.line,
        char: inPosition.character,
        length: 2,
        tokenType: 'keyword',
        modifiers: []
      });
    }
    
    // Process source collection
    if (values.source && Array.isArray(values.source)) {
      for (const sourceNode of values.source) {
        this.mainVisitor.visitNode(sourceNode, context);
      }
    }
    
    // Check if using block syntax with [ ]
    const hasBlockSyntax = directive.meta?.actionType === 'block';

    if (hasBlockSyntax) {
      // Find and tokenize opening bracket '['
      const openBracketIndex = directiveText.indexOf('[');
      if (openBracketIndex !== -1) {
        this.operatorHelper.addOperatorToken(
          directive.location.start.offset + openBracketIndex,
          1
        );
      }
    } else {
      // Find and tokenize "=>" operator (inline syntax)
      const arrowMatch = directiveText.match(/\s+=>\s+/);
      if (arrowMatch && arrowMatch.index !== undefined) {
        const arrowOffset = directive.location.start.offset + arrowMatch.index + arrowMatch[0].indexOf('=>');
        const arrowPosition = this.document.positionAt(arrowOffset);

        this.tokenBuilder.addToken({
          line: arrowPosition.line,
          char: arrowPosition.character,
          length: 2,
          tokenType: 'modifier',
          modifiers: []
        });
      }
    }

    // Process action
    if (values.action && Array.isArray(values.action)) {
      for (const actionNode of values.action) {
        // Handle let assignments in blocks
        if (actionNode.type === 'LetAssignment') {
          this.visitLetAssignment(actionNode, directive, context);
        } else if (actionNode.type === 'AugmentedAssignment') {
          this.visitAugmentedAssignment(actionNode, directive, context);
        } else if (actionNode.type === 'Directive' && actionNode.kind === 'output') {
          // Special handling for output directives to ensure proper tokenization
          this.visitOutputDirective(actionNode, context);
        } else {
          this.mainVisitor.visitNode(actionNode, context);
        }
        // Handle comments attached to nested action directives
        if (actionNode.type === 'Directive' && actionNode.meta?.comment) {
          this.handleDirectiveComment(actionNode);
        }
      }
    }

    if (hasBlockSyntax) {
      // Find and tokenize closing bracket ']'
      const closeBracketIndex = directiveText.lastIndexOf(']');
      if (closeBracketIndex !== -1) {
        this.operatorHelper.addOperatorToken(
          directive.location.start.offset + closeBracketIndex,
          1
        );
      }
    }

    // Tokenize pipeline operators (| and ||) for batch pipelines
    this.tokenizePipelineOperators(directive);
  }

  private visitExeBlock(directive: any, context: VisitorContext): void {
    const values = directive.values;
    if (!values || !directive.location) return;

    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);

    // Find and tokenize opening bracket '['
    const openBracketIndex = directiveText.indexOf('[');
    if (openBracketIndex !== -1) {
      this.operatorHelper.addOperatorToken(
        directive.location.start.offset + openBracketIndex,
        1
      );
    }

    // Process block statements (let assignments, directives, etc.)
    if (values.statements && Array.isArray(values.statements)) {
      for (const statement of values.statements) {
        if (statement.type === 'LetAssignment') {
          this.visitLetAssignment(statement, directive, context);
        } else if (statement.type === 'AugmentedAssignment') {
          this.visitAugmentedAssignment(statement, directive, context);
        } else {
          this.mainVisitor.visitNode(statement, context);
        }
      }
    }

    // Process return statement: => expression
    if (values.return && values.return.type === 'ExeReturn') {
      // Find and tokenize '=>' operator
      const returnRaw = values.return.raw;
      if (returnRaw && returnRaw.startsWith('=>')) {
        const arrowMatch = directiveText.match(/=>/);
        if (arrowMatch && arrowMatch.index !== undefined) {
          const arrowOffset = directive.location.start.offset + arrowMatch.index;
          const arrowPosition = this.document.positionAt(arrowOffset);
          this.tokenBuilder.addToken({
            line: arrowPosition.line,
            char: arrowPosition.character,
            length: 2,
            tokenType: 'modifier',
            modifiers: []
          });
        }
      }

      // Process return value expressions
      if (values.return.values && Array.isArray(values.return.values)) {
        for (const returnValue of values.return.values) {
          this.mainVisitor.visitNode(returnValue, context);
        }
      }
    }

    // Find and tokenize closing bracket ']'
    const closeBracketIndex = directiveText.lastIndexOf(']');
    if (closeBracketIndex !== -1) {
      this.operatorHelper.addOperatorToken(
        directive.location.start.offset + closeBracketIndex,
        1
      );
    }
  }

  private visitGuardDirective(directive: any, context: VisitorContext): void {
    const values = directive.values;
    if (!values || !directive.location) return;

    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);

    // Tokenize the guard name if present (@guardName)
    if (values.name && Array.isArray(values.name) && values.name[0]?.location) {
      const nameNode = values.name[0];
      this.tokenBuilder.addToken({
        line: nameNode.location.start.line - 1,
        char: nameNode.location.start.column - 1,
        length: (nameNode.identifier?.length || 0) + 1, // +1 for @
        tokenType: 'variable',
        modifiers: ['declaration']
      });
    }

    // Tokenize timing keyword (before/after/always)
    const timingMatch = directiveText.match(/\b(before|after|always)\b/);
    if (timingMatch && timingMatch.index !== undefined) {
      const timingOffset = directive.location.start.offset + timingMatch.index;
      const timingPosition = this.document.positionAt(timingOffset);

      this.tokenBuilder.addToken({
        line: timingPosition.line,
        char: timingPosition.character,
        length: timingMatch[1].length,
        tokenType: 'keyword',
        modifiers: []
      });
    }

    // Tokenize guard filter (op:run, op:exe, or data label)
    if (values.filter && Array.isArray(values.filter) && values.filter[0]) {
      const filterNode = values.filter[0];

      if (filterNode.filterKind === 'operation') {
        // op:run, op:exe, etc.
        const opMatch = directiveText.match(/\bop:(\w+(?:\.\w+)*)/);
        if (opMatch && opMatch.index !== undefined) {
          const opOffset = directive.location.start.offset + opMatch.index;
          const opPosition = this.document.positionAt(opOffset);

          // Tokenize 'op' as keyword
          this.tokenBuilder.addToken({
            line: opPosition.line,
            char: opPosition.character,
            length: 2, // 'op'
            tokenType: 'keyword',
            modifiers: []
          });

          // Tokenize ':' as operator
          this.tokenBuilder.addToken({
            line: opPosition.line,
            char: opPosition.character + 2,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });

          // Tokenize the operation identifier
          this.tokenBuilder.addToken({
            line: opPosition.line,
            char: opPosition.character + 3,
            length: opMatch[1].length,
            tokenType: 'variable',
            modifiers: []
          });
        }
      } else if (filterNode.filterKind === 'data') {
        // Data label filter - find and tokenize
        const labelValue = filterNode.value;
        if (labelValue) {
          const labelMatch = directiveText.match(new RegExp(`\\b${labelValue}\\b`));
          if (labelMatch && labelMatch.index !== undefined) {
            const labelOffset = directive.location.start.offset + labelMatch.index;
            const labelPosition = this.document.positionAt(labelOffset);

            this.tokenBuilder.addToken({
              line: labelPosition.line,
              char: labelPosition.character,
              length: labelValue.length,
              tokenType: 'label',
              modifiers: []
            });
          }
        }
      }
    }

    // Tokenize '=' operator
    const equalMatch = directiveText.match(/\s+=\s+/);
    if (equalMatch && equalMatch.index !== undefined) {
      const equalOffset = directive.location.start.offset + equalMatch.index + equalMatch[0].indexOf('=');
      this.operatorHelper.addOperatorToken(equalOffset, 1);
    }

    // Tokenize 'when' keyword
    const whenMatch = directiveText.match(/\bwhen\b/);
    if (whenMatch && whenMatch.index !== undefined) {
      const whenOffset = directive.location.start.offset + whenMatch.index;
      const whenPosition = this.document.positionAt(whenOffset);

      this.tokenBuilder.addToken({
        line: whenPosition.line,
        char: whenPosition.character,
        length: 4,
        tokenType: 'keyword',
        modifiers: []
      });
    }

    // Tokenize guard block modifier (first/all/any) - same as exe when blocks
    if (values.guard && Array.isArray(values.guard) && values.guard[0]) {
      const guardBlock = values.guard[0];
      if (guardBlock.modifier && guardBlock.modifier !== 'default') {
        const modifierMatch = directiveText.match(new RegExp(`\\bwhen\\s+(${guardBlock.modifier})\\b`));
        if (modifierMatch && modifierMatch.index !== undefined) {
          const modifierOffset = directive.location.start.offset + modifierMatch.index + modifierMatch[0].indexOf(guardBlock.modifier);
          const modifierPosition = this.document.positionAt(modifierOffset);

          this.tokenBuilder.addToken({
            line: modifierPosition.line,
            char: modifierPosition.character,
            length: guardBlock.modifier.length,
            tokenType: 'keyword',
            modifiers: []
          });
        }
      }
    }

    // Tokenize guard block brackets and rules
    if (values.guard && Array.isArray(values.guard) && values.guard[0]) {
      const guardBlock = values.guard[0];

      // Find opening bracket (use enum for dim structural color)
      const openBracketIndex = directiveText.indexOf('[');
      if (openBracketIndex !== -1) {
        const openBracketPosition = this.document.positionAt(directive.location.start.offset + openBracketIndex);
        this.tokenBuilder.addToken({
          line: openBracketPosition.line,
          char: openBracketPosition.character,
          length: 1,
          tokenType: 'enum',
          modifiers: []
        });
      }

      // Process guard rules
      if (guardBlock.rules && Array.isArray(guardBlock.rules)) {
        for (const rule of guardBlock.rules) {
          // Handle let assignments
          if (rule.type === 'LetAssignment') {
            this.visitLetAssignment(rule, directive, context);
            continue;
          }

          // Handle wildcard condition
          if (rule.isWildcard && rule.location) {
            const wildcardMatch = directiveText.match(/\*/);
            if (wildcardMatch && wildcardMatch.index !== undefined) {
              const wildcardOffset = directive.location.start.offset + wildcardMatch.index;
              const wildcardPosition = this.document.positionAt(wildcardOffset);

              this.tokenBuilder.addToken({
                line: wildcardPosition.line,
                char: wildcardPosition.character,
                length: 1,
                tokenType: 'keyword',
                modifiers: []
              });
            }
          }

          // Process condition (same as exe when blocks)
          if (rule.condition) {
            if (Array.isArray(rule.condition)) {
              for (const cond of rule.condition) {
                this.mainVisitor.visitNode(cond, context);
              }
            } else {
              this.mainVisitor.visitNode(rule.condition, context);
            }
          }

          // Find and tokenize '=>' operator between condition and action
          if (rule.location) {
            const ruleText = sourceText.substring(rule.location.start.offset, rule.location.end.offset);
            const arrowMatch = ruleText.match(/=>/);
            if (arrowMatch && arrowMatch.index !== undefined) {
              const arrowOffset = rule.location.start.offset + arrowMatch.index;
              const arrowPosition = this.document.positionAt(arrowOffset);
              this.tokenBuilder.addToken({
                line: arrowPosition.line,
                char: arrowPosition.character,
                length: 2,
                tokenType: 'modifier',
                modifiers: []
              });
            }
          }

          // Process action (allow/deny/retry)
          if (rule.action) {
            const action = rule.action;
            const decision = action.decision;

            // Find and tokenize the action keyword (allow/deny/retry)
            // Use 'modifier' type for standout pink color like var/exe
            if (decision && rule.location) {
              const ruleText = sourceText.substring(rule.location.start.offset, rule.location.end.offset);
              const actionMatch = ruleText.match(new RegExp(`\\b${decision}\\b`));
              if (actionMatch && actionMatch.index !== undefined) {
                const actionOffset = rule.location.start.offset + actionMatch.index;
                const actionPosition = this.document.positionAt(actionOffset);

                this.tokenBuilder.addToken({
                  line: actionPosition.line,
                  char: actionPosition.character,
                  length: decision.length,
                  tokenType: 'modifier',
                  modifiers: []
                });
              }
            }

            // Tokenize action value (for allow @transform(@input))
            if (action.value && Array.isArray(action.value)) {
              for (const valueNode of action.value) {
                this.mainVisitor.visitNode(valueNode, context);
              }
            }

            // Tokenize message string (for deny "msg" or retry "hint")
            if (action.message && action.rawMessage) {
              // Find and tokenize the message string
              if (rule.location) {
                const ruleText = sourceText.substring(rule.location.start.offset, rule.location.end.offset);
                const msgMatch = ruleText.match(/"[^"]*"/);
                if (msgMatch && msgMatch.index !== undefined) {
                  const msgOffset = rule.location.start.offset + msgMatch.index;
                  const msgPosition = this.document.positionAt(msgOffset);

                  this.tokenBuilder.addToken({
                    line: msgPosition.line,
                    char: msgPosition.character,
                    length: msgMatch[0].length,
                    tokenType: 'string',
                    modifiers: []
                  });
                }
              }
            }
          }
        }
      }

      // Find closing bracket (use enum for dim structural color)
      const closeBracketIndex = directiveText.lastIndexOf(']');
      if (closeBracketIndex !== -1) {
        const closeBracketPosition = this.document.positionAt(directive.location.start.offset + closeBracketIndex);
        this.tokenBuilder.addToken({
          line: closeBracketPosition.line,
          char: closeBracketPosition.character,
          length: 1,
          tokenType: 'enum',
          modifiers: []
        });
      }
    }
  }

  private visitLetAssignment(letNode: any, directive: any, context: VisitorContext): void {
    if (!letNode.location) return;

    const sourceText = this.document.getText();
    const letText = sourceText.substring(letNode.location.start.offset, letNode.location.end.offset);

    // Tokenize 'let' keyword
    const letMatch = letText.match(/^let\b/);
    if (letMatch) {
      const letPosition = this.document.positionAt(letNode.location.start.offset);
      this.tokenBuilder.addToken({
        line: letPosition.line,
        char: letPosition.character,
        length: 3, // 'let'
        tokenType: 'keyword',
        modifiers: []
      });
    }

    // Tokenize the variable being assigned
    if (letNode.variable) {
      const varNode = Array.isArray(letNode.variable) ? letNode.variable[0] : letNode.variable;
      if (varNode?.location) {
        this.tokenBuilder.addToken({
          line: varNode.location.start.line - 1,
          char: varNode.location.start.column - 1,
          length: (varNode.identifier?.length || 0) + 1, // +1 for @
          tokenType: 'variable',
          modifiers: ['declaration']
        });
      }
    }

    // Tokenize '=' or '+=' operator
    const operatorMatch = letText.match(/\s*(\+?=)\s*/);
    if (operatorMatch && operatorMatch.index !== undefined) {
      const operatorText = operatorMatch[1];
      const operatorOffset = letNode.location.start.offset + operatorMatch.index + operatorMatch[0].indexOf(operatorText);
      this.operatorHelper.addOperatorToken(operatorOffset, operatorText.length);
    }

    // Process the value expression
    if (letNode.value) {
      const valueNodes = Array.isArray(letNode.value) ? letNode.value : [letNode.value];
      for (const valueNode of valueNodes) {
        this.mainVisitor.visitNode(valueNode, context);
      }
    }

    // Handle end-of-line comment if present
    if (letNode.meta?.comment) {
      this.visitEndOfLineComment(letNode.meta.comment);
    }
  }

  private visitAugmentedAssignment(augNode: any, directive: any, context: VisitorContext): void {
    if (!augNode.location) return;

    const sourceText = this.document.getText();

    // Look backwards up to 4 characters for 'let ' keyword
    const searchStart = Math.max(0, augNode.location.start.offset - 4);
    const beforeNode = sourceText.substring(searchStart, augNode.location.start.offset + 4);
    const letMatch = beforeNode.match(/let\s/);

    if (letMatch && letMatch.index !== undefined) {
      const letOffset = searchStart + letMatch.index;
      const letPosition = this.document.positionAt(letOffset);
      this.tokenBuilder.addToken({
        line: letPosition.line,
        char: letPosition.character,
        length: 3, // 'let'
        tokenType: 'keyword',
        modifiers: []
      });
    }

    // Tokenize the variable being assigned
    if (augNode.variable) {
      const varNode = Array.isArray(augNode.variable) ? augNode.variable[0] : augNode.variable;
      if (varNode?.location) {
        this.tokenBuilder.addToken({
          line: varNode.location.start.line - 1,
          char: varNode.location.start.column - 1,
          length: (varNode.identifier?.length || 0) + 1, // +1 for @
          tokenType: 'variable',
          modifiers: ['declaration']
        });
      }
    }

    // Tokenize the augmented operator (+=, -=, etc.)
    if (augNode.operator) {
      const augText = sourceText.substring(augNode.location.start.offset, augNode.location.end.offset);
      const operatorMatch = augText.match(/\s*(\+\=|\-\=|\*\=|\/\=)\s*/);
      if (operatorMatch && operatorMatch.index !== undefined) {
        const operatorText = operatorMatch[1];
        const operatorOffset = augNode.location.start.offset + operatorMatch.index + operatorMatch[0].indexOf(operatorText);
        this.operatorHelper.addOperatorToken(operatorOffset, operatorText.length);
      }
    }

    // Process the value expression
    if (augNode.value) {
      const valueNodes = Array.isArray(augNode.value) ? augNode.value : [augNode.value];
      for (const valueNode of valueNodes) {
        this.mainVisitor.visitNode(valueNode, context);
      }
    }
  }

  /**
   * Tokenizes inline pipeline operators (| and ||) in directive text.
   * - | separates sequential pipeline stages
   * - || separates parallel stages within a group
   */
  private tokenizePipelineOperators(directive: any): void {
    if (!directive.location) return;

    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);

    // Find all | and || operators (but not inside strings or braces)
    let inString = false;
    let stringChar = '';
    let braceDepth = 0;
    let i = 0;

    // Skip past the directive keyword
    const directiveKeyword = '/' + directive.kind;
    i = directiveText.indexOf(directiveKeyword);
    if (i !== -1) {
      i += directiveKeyword.length;
    } else {
      i = 0;
    }

    while (i < directiveText.length) {
      const ch = directiveText[i];
      const nextCh = directiveText[i + 1];

      // Track string boundaries
      if (!inString && (ch === '"' || ch === "'" || ch === '`')) {
        inString = true;
        stringChar = ch;
        i++;
        continue;
      }
      if (inString && ch === stringChar && directiveText[i - 1] !== '\\') {
        inString = false;
        i++;
        continue;
      }

      // Track brace depth
      if (!inString) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }

      // Look for pipe operators (only outside strings and braces)
      if (!inString && braceDepth === 0 && ch === '|') {
        const pipeOffset = directive.location.start.offset + i;
        const pipePosition = this.document.positionAt(pipeOffset);

        if (nextCh === '|') {
          // || parallel operator
          this.tokenBuilder.addToken({
            line: pipePosition.line,
            char: pipePosition.character,
            length: 2,
            tokenType: 'operator',
            modifiers: []
          });
          i += 2;
          continue;
        } else {
          // | sequential operator
          this.tokenBuilder.addToken({
            line: pipePosition.line,
            char: pipePosition.character,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
          i++;
          continue;
        }
      }

      i++;
    }
  }

  /**
   * Tokenizes security/data labels that appear at the end of directives.
   * Labels appear as comma-separated identifiers after the main directive content.
   * Example: /run {echo hello} sensitive, pii
   */
  private tokenizeSecurityLabels(directive: any): void {
    const labels = directive.values?.securityLabels || directive.meta?.securityLabels;
    const rawLabels = directive.raw?.securityLabels;

    if (!labels || !rawLabels || !directive.location) return;

    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(directive.location.start.offset, directive.location.end.offset);

    // Find the raw labels string in the directive text
    // Labels appear at the end, so search from the end
    const labelsIndex = directiveText.lastIndexOf(rawLabels);
    if (labelsIndex === -1) return;

    // Tokenize each label
    const labelsArray = Array.isArray(labels) ? labels : [labels];
    let searchStart = labelsIndex;

    for (const label of labelsArray) {
      const labelIndex = directiveText.indexOf(label, searchStart);
      if (labelIndex !== -1) {
        const labelOffset = directive.location.start.offset + labelIndex;
        const labelPosition = this.document.positionAt(labelOffset);

        this.tokenBuilder.addToken({
          line: labelPosition.line,
          char: labelPosition.character,
          length: label.length,
          tokenType: 'parameter',
          modifiers: []
        });

        searchStart = labelIndex + label.length;

        // Also tokenize comma if there are more labels
        const commaIndex = directiveText.indexOf(',', searchStart);
        if (commaIndex !== -1 && commaIndex < directiveText.length) {
          const commaOffset = directive.location.start.offset + commaIndex;
          this.operatorHelper.addOperatorToken(commaOffset, 1);
          searchStart = commaIndex + 1;
        }
      }
    }
  }

  private visitWhileDirective(node: any, context: VisitorContext): void {
    if (!node.values || !node.location) return;

    const sourceText = this.document.getText();
    const directiveText = sourceText.substring(node.location.start.offset, node.location.end.offset);

    // Tokenize the cap limit: (100)
    if (node.values.cap !== undefined) {
      const capMatch = directiveText.match(/\((\d+)\)/);
      if (capMatch && capMatch.index !== undefined) {
        const openParenOffset = node.location.start.offset + capMatch.index;
        const closeParenOffset = openParenOffset + capMatch[0].length - 1;

        // Tokenize opening parenthesis
        this.operatorHelper.addOperatorToken(openParenOffset, 1);

        // Tokenize the number
        const numOffset = openParenOffset + 1;
        const numPos = this.document.positionAt(numOffset);
        this.tokenBuilder.addToken({
          line: numPos.line,
          char: numPos.character,
          length: capMatch[1].length,
          tokenType: 'number',
          modifiers: []
        });

        // Tokenize closing parenthesis
        this.operatorHelper.addOperatorToken(closeParenOffset, 1);
      }
    }

    // Visit the processor reference
    if (node.values.processor && Array.isArray(node.values.processor)) {
      for (const proc of node.values.processor) {
        this.mainVisitor.visitNode(proc, context);
      }
    }
  }

  private visitStreamDirective(node: any, context: VisitorContext): void {
    if (!node.values || !node.location) return;

    // Visit the invocation/reference
    if (node.values.invocation) {
      this.mainVisitor.visitNode(node.values.invocation, context);
    }
  }

  /**
   * Get token type for directive keyword based on kind
   * Different directive groups use different semantic types for color coding
   */
  private getDirectiveTokenType(kind: string): string {
    switch (kind) {
      // Definition directives: var, exe, guard, policy
      // Use 'modifier' semantic type → renders as pink italic
      case 'var':
      case 'exe':
      case 'guard':
      case 'policy':
        return 'directiveDefinition';

      // Action directives: run, show, output, append, log, stream
      // Use 'property' semantic type → renders as darker teal + italic
      case 'run':
      case 'show':
      case 'output':
      case 'append':
      case 'log':
      case 'stream':
        return 'directiveAction';

      // Everything else (for/when/while/import/export/etc)
      // Uses 'directive' → maps to 'keyword' → light teal italic
      default:
        return 'directive';
    }
  }
}
