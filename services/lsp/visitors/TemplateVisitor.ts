import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { INodeVisitor } from '@services/lsp/visitors/base/VisitorInterface';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { LspAstNode, asLspAstNode } from '@services/lsp/visitors/base/LspAstNode';

export class TemplateVisitor extends BaseVisitor {
  private mainVisitor!: INodeVisitor;

  setMainVisitor(visitor: INodeVisitor): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: unknown): boolean {
    const astNode = asLspAstNode(node);
    return astNode.type === 'Template' ||
           astNode.type === 'StringLiteral' ||
           astNode.type === 'TemplateForBlock' ||
           astNode.type === 'TemplateInlineShow' ||
           astNode.type === 'Text';
  }
  
  visitNode(node: unknown, context: VisitorContext): void {
    const astNode = asLspAstNode(node);
    if (!astNode.location) return;

    if (astNode.type === 'TemplateForBlock') {
      this.visitTemplateForBlock(astNode, context);
      return;
    }

    if (astNode.type === 'TemplateInlineShow') {
      this.visitTemplateInlineShow(astNode, context);
      return;
    }

    if (astNode.type === 'Text') {
      this.visitTextNode(astNode, context);
      return;
    }

    if (astNode.type === 'StringLiteral') {
      this.visitStringLiteral(astNode, context);
    } else {
      this.visitTemplate(astNode, context);
    }
  }
  
  private visitTextNode(node: LspAstNode, context: VisitorContext): void {
    // Handle Text nodes based on wrapper type
    // - In double-quoted strings: tokenize as 'string' (light green)
    // - In backtick/colon templates: tokenize /for and /end as 'property' (teal), rest as default
    // - Single-quoted strings are handled as StringLiteral, not as Text children

    const wrapperType = context.wrapperType;

    if (wrapperType === 'doubleQuote') {
      // Double quotes: tokenize text content as string (light green)
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: node.location.end.offset - node.location.start.offset,
        tokenType: 'string',
        modifiers: []
      });
    } else if (wrapperType === 'backtick' || wrapperType === 'doubleColon' || wrapperType === 'tripleColon' || wrapperType === 'att') {
      // Backtick/colon templates: check for /for, /end, {{for}}, {{end}} keywords
      const content = typeof node.content === 'string' ? node.content : '';

      // Match both /for and {{for}} styles
      const forMatch = content.match(/\/(for|end)\b|\{\{\s*(for|end)\b/);

      if (forMatch && forMatch.index !== undefined) {
        if (forMatch[0].startsWith('/')) {
          // Slash style: /for or /end
          const slashOffset = node.location.start.offset + forMatch.index;
          const keywordOffset = slashOffset + 1; // +1 to skip the /
          const keywordPos = this.document.positionAt(keywordOffset);

          // Tokenize / as operator
          const slashPos = this.document.positionAt(slashOffset);
          this.tokenBuilder.addToken({
            line: slashPos.line,
            char: slashPos.character,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });

          // Tokenize for/end as property (teal)
          this.tokenBuilder.addToken({
            line: keywordPos.line,
            char: keywordPos.character,
            length: forMatch[1]?.length ?? 0,
            tokenType: 'property', // teal color (italic via nvim config)
            modifiers: []
          });
        } else {
          // Mustache style: {{for}} or {{end}}
          const keywordName = forMatch[2];
          if (!keywordName) return;
          const keywordIndex = forMatch[0].indexOf(keywordName);
          const keywordOffset = node.location.start.offset + forMatch.index + keywordIndex;
          const keywordPos = this.document.positionAt(keywordOffset);

          this.tokenBuilder.addToken({
            line: keywordPos.line,
            char: keywordPos.character,
            length: keywordName.length,
            tokenType: 'property', // teal color (italic via nvim config)
            modifiers: []
          });
        }
      }
      // Don't tokenize rest of Text - let it be default/white color
    } else if (wrapperType === 'mtt') {
      // MTT templates: only {{for}}, {{end}} keywords (no slash syntax)
      const content = typeof node.content === 'string' ? node.content : '';
      const forMatch = content.match(/\{\{\s*(for|end)\b/);

      if (forMatch && forMatch.index !== undefined) {
        const keywordName = forMatch[1];
        if (!keywordName) return;
        const keywordIndex = forMatch[0].indexOf(keywordName);
        const keywordOffset = node.location.start.offset + forMatch.index + keywordIndex;
        const keywordPos = this.document.positionAt(keywordOffset);

        this.tokenBuilder.addToken({
          line: keywordPos.line,
          char: keywordPos.character,
          length: keywordName.length,
          tokenType: 'property',
          modifiers: []
        });
      }
      // Don't tokenize rest of Text - let it be default color
    }
  }

  private visitStringLiteral(node: LspAstNode, context: VisitorContext): void {
    const text = this.getCachedText(
      { line: node.location.start.line - 1, character: node.location.start.column - 1 },
      { line: node.location.end.line - 1, character: node.location.end.column }
    );

    const isSingleQuoted = text.startsWith("'") && text.endsWith("'");

    if (isSingleQuoted) {
      // Single quotes: tokenize entire content as string with literal modifier (italic gold)
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: text.length,
        tokenType: 'string',
        modifiers: ['literal']
      });
    } else {
      // Double quotes: don't tokenize whole string, let children handle themselves
      // Text children will be tokenized as 'string' (light green)
      // VariableReference children will be tokenized as 'variable' (light blue)
      const newContext = {
        ...context,
        interpolationAllowed: true,
        variableStyle: '@var' as const,
        wrapperType: 'doubleQuote' as const
      };

      this.visitChildren(node, newContext, (child, mx) => this.mainVisitor.visitNode(child, mx));
    }
  }
  
  private visitTemplate(node: LspAstNode, context: VisitorContext): void {
    let templateType: 'backtick' | 'doubleColon' | 'tripleColon' | null = null;
    let variableStyle: '@var' | '{{var}}' = '@var';
    let delimiterLength = 1;
    
    if (typeof node.delimiter === 'string') {
      switch (node.delimiter) {
        case '`':
          templateType = 'backtick';
          delimiterLength = 1;
          break;
        case '::':
          templateType = 'doubleColon';
          delimiterLength = 2;
          break;
        case ':::':
          templateType = 'tripleColon';
          variableStyle = '{{var}}';
          delimiterLength = 3;
          break;
      }
    } else if (typeof node.templateType === 'string') {
      templateType = node.templateType as 'backtick' | 'doubleColon' | 'tripleColon';
      delimiterLength = templateType === 'tripleColon' ? 3 : (templateType === 'doubleColon' ? 2 : 1);
      if (templateType === 'tripleColon') {
        variableStyle = '{{var}}';
      }
    }
    
    if (templateType) {
      if (node.openDelimiterLocation) {
        this.tokenBuilder.addToken({
          line: node.openDelimiterLocation.start.line - 1,
          char: node.openDelimiterLocation.start.column - 1,
          length: delimiterLength,
          tokenType: 'template',
          modifiers: []
        });
      }
      
      if (node.closeDelimiterLocation) {
        this.tokenBuilder.addToken({
          line: node.closeDelimiterLocation.start.line - 1,
          char: node.closeDelimiterLocation.start.column - 1,
          length: delimiterLength,
          tokenType: 'template',
          modifiers: []
        });
      }
      
      const newContext = {
        ...context,
        templateType,
        interpolationAllowed: true,
        variableStyle,
        wrapperType: templateType
      };

      this.visitChildren(node, newContext, (child, mx) => this.mainVisitor.visitNode(child, mx));
    }
  }

  private visitTemplateForBlock(node: LspAstNode, context: VisitorContext): void {
    // Heuristic tokenization: highlight 'for' and 'end' markers inside the block span
    const src = this.document.getText();
    const text = src.substring(node.location.start.offset, node.location.end.offset);
    // Match slash-style and mustache-style
    const forRegexes = [/\/(for)\b/, /\{\{\s*(for)\b/];
    const endRegexes = [/\/(end)\b/, /\{\{\s*(end)\s*\}\}/];

    for (const re of forRegexes) {
      const m = text.match(re);
      if (m && m.index !== undefined && m[1]) {
        const abs = node.location.start.offset + m.index + (m[0].length - m[1].length);
        const pos = this.document.positionAt(abs);
        // Use 'property' for teal color (italic will be added in nvim config)
        this.tokenBuilder.addToken({ line: pos.line, char: pos.character, length: m[1].length, tokenType: 'property', modifiers: [] });
        break;
      }
    }
    for (const re of endRegexes) {
      const m = text.match(re);
      if (m && m.index !== undefined && m[1]) {
        const abs = node.location.start.offset + m.index + (m[0].length - m[1].length);
        const pos = this.document.positionAt(abs);
        // Use 'property' for teal color (italic will be added in nvim config)
        this.tokenBuilder.addToken({ line: pos.line, char: pos.character, length: m[1].length, tokenType: 'property', modifiers: [] });
        break;
      }
    }

    // Visit loop variable
    if (node.variable) {
      this.mainVisitor.visitNode(node.variable, context);
    }

    // Visit source (the iterable)
    if (node.source) {
      if (Array.isArray(node.source)) {
        for (const sourceNode of node.source) {
          this.mainVisitor.visitNode(sourceNode, context);
        }
      } else {
        this.mainVisitor.visitNode(node.source, context);
      }
    }

    // Visit block body for nested nodes
    if (Array.isArray(node.body)) {
      for (const child of node.body) {
        this.mainVisitor.visitNode(child, context);
      }
    }
  }

  private visitTemplateInlineShow(node: LspAstNode, context: VisitorContext): void {
    // Highlight '/show' or '{{show}}' marker at start of node
    const src = this.document.getText();
    const text = src.substring(node.location.start.offset, node.location.end.offset);
    const re = /(\/show)\b|\{\{\s*show\b/;
    const m = text.match(re);
    if (m && m.index !== undefined) {
      const len = m[1] ? m[1].length : 4; // '/show' or 'show'
      const offsetAdjust = m[1] ? 0 : (m[0].indexOf('show'));
      const abs = node.location.start.offset + m.index + offsetAdjust;
      const pos = this.document.positionAt(abs);
      this.tokenBuilder.addToken({ line: pos.line, char: pos.character, length: len, tokenType: 'directive', modifiers: [] });
    }

    // Visit children within inline show payloads
    this.visitChildren(node, context, (child, mx) => this.mainVisitor.visitNode(child, mx));
  }
}
