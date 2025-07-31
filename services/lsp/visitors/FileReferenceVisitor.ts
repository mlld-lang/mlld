import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { TextExtractor } from '@services/lsp/utils/TextExtractor';

export class FileReferenceVisitor extends BaseVisitor {
  private mainVisitor: any;
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'FileReference' || 
           node.type === 'load-content' ||
           node.type === 'Comment' ||
           node.type === 'Parameter' ||
           node.type === 'Frontmatter' ||
           node.type === 'CodeFence' ||
           node.type === 'MlldRunBlock';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    switch (node.type) {
      case 'FileReference':
        this.visitFileReference(node, context);
        break;
      case 'load-content':
        this.visitLoadContent(node, context);
        break;
      case 'Comment':
        this.visitComment(node);
        break;
      case 'Parameter':
        this.visitParameter(node);
        break;
      case 'Frontmatter':
        this.visitFrontmatter(node, context);
        break;
      case 'CodeFence':
      case 'MlldRunBlock':
        this.visitCodeFence(node);
        break;
    }
  }
  
  private visitFileReference(node: any, context: VisitorContext): void {
    const text = TextExtractor.extract([node]);
    
    // Always tokenize as: <, filename, > (and possibly # section)
    const nodeStartChar = node.location.start.column - 1;
    const sourceText = this.document.getText();
    const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    
    // Token for "<"
    this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: nodeStartChar,
        length: 1,
        tokenType: 'alligatorOpen',
        modifiers: []
      });
      
      // Calculate the end of the file reference part (before field access or pipes)
      let fileRefEndOffset = node.location.end.offset;
      if (node.fields && node.fields.length > 0) {
        // Find where the first dot appears for field access
        const firstDotIndex = nodeText.lastIndexOf('>');
        if (firstDotIndex !== -1) {
          fileRefEndOffset = node.location.start.offset + firstDotIndex + 1;
        }
      } else if (node.pipes && node.pipes.length > 0) {
        // Find where the first pipe appears
        const firstPipeIndex = nodeText.indexOf('|');
        if (firstPipeIndex !== -1) {
          fileRefEndOffset = node.location.start.offset + firstPipeIndex;
        }
      }
      
      if (!node.section) {
        // No section - just filename and >
        const filenameEnd = fileRefEndOffset - node.location.start.offset - 1; // -1 for >
        const filenameLength = filenameEnd - 1; // -1 for <
        if (filenameLength > 0) {
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: nodeStartChar + 1,
            length: filenameLength,
            tokenType: 'alligator',
            modifiers: []
          });
        }
        
        // Token for ">"
        const closePos = nodeStartChar + filenameEnd;
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: closePos,
          length: 1,
          tokenType: 'alligatorClose',
          modifiers: []
        });
      } else {
        // Has section - need to handle # and section name
        const hashIndex = text.indexOf('#');
        
        // Token for filename (between < and #)
        if (hashIndex > 1) {
          const filenameLength = hashIndex - 1; // From after < to before #
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: nodeStartChar + 1,
            length: filenameLength,
            tokenType: 'alligator',
            modifiers: []
          });
        }
        
        // Token for "#"
        if (hashIndex !== -1) {
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: nodeStartChar + hashIndex,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
        }
        
        // Token for section
        if (node.sectionLocation) {
          this.tokenBuilder.addToken({
            line: node.sectionLocation.start.line - 1,
            char: node.sectionLocation.start.column - 1,
            length: node.section.length,
            tokenType: 'section',
            modifiers: []
          });
        }
        
        // Token for ">"
        const closePos = nodeText.lastIndexOf('>');
        if (closePos !== -1) {
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: nodeStartChar + closePos,
            length: 1,
            tokenType: 'alligatorClose',
            modifiers: []
          });
        }
      }
      
      // Handle field access
      if (node.fields && node.fields.length > 0) {
        let currentPos = fileRefEndOffset - node.location.start.offset;
        for (const field of node.fields) {
          // Find the dot position
          const dotPos = sourceText.indexOf('.', node.location.start.offset + currentPos);
          if (dotPos !== -1) {
            const dotChar = dotPos - node.location.start.offset;
            // Token for "."
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: nodeStartChar + dotChar,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
            
            // Token for field name
            const fieldLength = field.value.length;
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: nodeStartChar + dotChar + 1,
              length: fieldLength,
              tokenType: 'property',
              modifiers: []
            });
            
            currentPos = dotChar + 1 + fieldLength;
          }
        }
      }
      
      // Handle pipes
      if (node.pipes && node.pipes.length > 0) {
        let currentPos = nodeText.indexOf('|');
        for (const pipe of node.pipes) {
          if (currentPos !== -1) {
            // Token for "|"
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: nodeStartChar + currentPos,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
            
            // Token for pipe name (including @)
            const pipeName = '@' + pipe.name;
            this.tokenBuilder.addToken({
              line: node.location.start.line - 1,
              char: nodeStartChar + currentPos + 1,
              length: pipeName.length,
              tokenType: 'variableRef',
              modifiers: []
            });
            
            // Find next pipe
            currentPos = nodeText.indexOf('|', currentPos + pipeName.length);
        }
      }
    }
  }
  
  private visitLoadContent(node: any, context: VisitorContext): void {
    const sourceText = this.document.getText();
    const nodeText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    const nodeStartChar = node.location.start.column - 1;
    
    // Token for "<"
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: nodeStartChar,
      length: 1,
      tokenType: 'alligatorOpen',
      modifiers: []
    });
    
    if (!node.options?.section?.identifier) {
      // No section - tokenize as: <, filename, >
      
      // Token for filename (everything between < and >)
      const filenameLength = nodeText.length - 2; // Exclude < and >
      if (filenameLength > 0) {
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: nodeStartChar + 1,
          length: filenameLength,
          tokenType: 'alligator',
          modifiers: []
        });
      }
      
      // Token for ">"
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: nodeStartChar + nodeText.length - 1,
        length: 1,
        tokenType: 'alligatorClose',
        modifiers: []
      });
    } else {
      // Has section - tokenize as: <, filename, #, section, >
      
      // Find the # position to know where filename ends
      const hashIndex = nodeText.indexOf('#');
      if (hashIndex === -1) return; // Shouldn't happen
      
      // Token for filename (from after < to before space before #)
      const spaceBeforeHash = nodeText.lastIndexOf(' ', hashIndex - 1);
      const filenameEnd = spaceBeforeHash > 0 ? spaceBeforeHash : hashIndex;
      const filenameLength = filenameEnd - 1; // -1 for the initial <
      
      if (filenameLength > 0) {
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: nodeStartChar + 1, // After <
          length: filenameLength,
          tokenType: 'alligator',
          modifiers: []
        });
      }
      
      // Token for "#"
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: nodeStartChar + hashIndex,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
      
      // Token for section
      const sectionNode = node.options.section.identifier;
      if (sectionNode.location) {
        this.tokenBuilder.addToken({
          line: sectionNode.location.start.line - 1,
          char: sectionNode.location.start.column - 1,
          length: sectionNode.location.end.column - sectionNode.location.start.column,
          tokenType: 'section',
          modifiers: []
        });
      }
      
      // Token for ">"
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: nodeStartChar + nodeText.length - 1,
        length: 1,
        tokenType: 'alligatorClose',
        modifiers: []
      });
    }
  }
  
  private getLineStartOffset(text: string, lineIndex: number): number {
    if (lineIndex === 0) return 0;
    
    let offset = 0;
    let currentLine = 0;
    
    for (let i = 0; i < text.length && currentLine < lineIndex; i++) {
      if (text[i] === '\n') {
        currentLine++;
        if (currentLine === lineIndex) {
          offset = i + 1;
          break;
        }
      }
    }
    
    return offset;
  }
  
  private visitComment(node: any): void {
    // Use the full location span to include the >> or << marker
    const length = node.location.end.offset - node.location.start.offset;
    
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: length,
      tokenType: 'comment',
      modifiers: []
    });
  }
  
  private visitParameter(node: any): void {
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.name?.length || TextExtractor.extract([node]).length,
      tokenType: 'parameter',
      modifiers: []
    });
  }
  
  private visitFrontmatter(node: any, context: VisitorContext): void {
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: 3,
      tokenType: 'comment',
      modifiers: []
    });
    
    this.visitChildren(node, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
    
    if (node.closeLocation) {
      this.tokenBuilder.addToken({
        line: node.closeLocation.start.line - 1,
        char: node.closeLocation.start.column - 1,
        length: 3,
        tokenType: 'comment',
        modifiers: []
      });
    }
  }
  
  private visitCodeFence(node: any): void {
    if (node.language && node.languageLocation) {
      this.tokenBuilder.addToken({
        line: node.languageLocation.start.line - 1,
        char: node.languageLocation.start.column - 1,
        length: node.language.length,
        tokenType: 'embedded',
        modifiers: []
      });
    }
    
    if (node.codeLocation && node.language) {
      this.tokenBuilder.addToken({
        line: node.codeLocation.start.line - 1,
        char: node.codeLocation.start.column - 1,
        length: node.code?.length || 0,
        tokenType: 'embeddedCode',
        modifiers: [],
        data: { language: node.language }
      });
    }
  }
}