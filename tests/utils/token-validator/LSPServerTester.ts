/**
 * LSPServerTester - Tests the actual LSP server to see what it sends to editors
 *
 * This is different from TokenCoverageValidator which calls ASTSemanticVisitor directly.
 * This tests the REAL code path that Vim/VSCode use.
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import type { SemanticToken } from './types.js';

export class LSPServerTester {
  private lsp: ChildProcess | null = null;
  private buffer: string = '';
  private messageId: number = 1;
  private pendingRequests: Map<number, (response: any) => void> = new Map();

  /**
   * Test what tokens the actual LSP server generates for a file
   */
  async testRealLSP(filePath: string, content: string): Promise<{
    tokens: SemanticToken[];
    diagnostics: any[];
    parseErrors: boolean;
  }> {
    const localWrapper = path.resolve(process.cwd(), 'bin/mlld-wrapper.cjs');
    const command = existsSync(localWrapper)
      ? { bin: process.execPath, args: [localWrapper, 'lsp'] }
      : { bin: 'mlld', args: ['lsp'] };

    // Start LSP server
    this.lsp = spawn(command.bin, command.args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const tokens: SemanticToken[] = [];
    const diagnostics: any[] = [];
    let parseErrors = false;

    // Set up message parsing
    this.lsp.stdout!.on('data', (data) => {
      this.buffer += data.toString();
      this.processMessages((msg) => {
        if (msg.method === 'textDocument/publishDiagnostics') {
          diagnostics.push(...(msg.params.diagnostics || []));
          parseErrors = diagnostics.some(d => d.message.includes('Parse error'));
        }

        if (typeof msg.id === 'number') {
          const resolver = this.pendingRequests.get(msg.id);
          if (resolver) {
            resolver(msg);
            this.pendingRequests.delete(msg.id);
          }
        }
      });
    });

    // Initialize
    await this.sendRequest('initialize', {
      capabilities: {
        textDocument: {
          semanticTokens: { requests: { full: true } }
        }
      },
      rootUri: `file://${process.cwd()}`,
      processId: process.pid
    });

    this.sendNotification('initialized', {});
    await this.wait(300);

    // Open document
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: `file://${filePath}`,
        languageId: 'mlld',
        version: 1,
        text: content
      }
    });

    await this.wait(500);

    // Request semantic tokens
    const tokenResponse = await Promise.race([
      this.sendRequest('textDocument/semanticTokens/full', {
        textDocument: { uri: `file://${filePath}` }
      }),
      this.wait(3000)
    ]);

    if (tokenResponse && typeof tokenResponse === 'object' && 'result' in tokenResponse && tokenResponse.result?.data) {
      tokens.push(...this.decodeSemanticTokens(tokenResponse.result.data, content));
    }

    this.lsp.kill();

    return { tokens, diagnostics, parseErrors };
  }

  private processMessages(handler: (msg: any) => void): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const headers = this.buffer.substring(0, headerEnd);
      const contentLengthMatch = headers.match(/Content-Length: (\d+)/);
      if (!contentLengthMatch) break;

      const contentLength = parseInt(contentLengthMatch[1]);
      const messageStart = headerEnd + 4;

      if (this.buffer.length < messageStart + contentLength) break;

      const message = this.buffer.substring(messageStart, messageStart + contentLength);
      this.buffer = this.buffer.substring(messageStart + contentLength);

      try {
        const parsed = JSON.parse(message);
        handler(parsed);
      } catch (e) {
        console.error('Failed to parse LSP message:', e);
      }
    }
  }

  private decodeSemanticTokens(data: number[], content: string): SemanticToken[] {
    const tokens: SemanticToken[] = [];
    const TOKEN_TYPES = [
      'keyword',
      'variable',
      'string',
      'operator',
      'label',
      'type',
      'parameter',
      'comment',
      'number',
      'property',
      'interface',
      'typeParameter',
      'namespace',
      'function',
      'modifier',
      'enum'
    ];

    let line = 0, char = 0;
    for (let i = 0; i < data.length; i += 5) {
      const deltaLine = data[i];
      const deltaChar = data[i + 1];
      const length = data[i + 2];
      const tokenType = TOKEN_TYPES[data[i + 3]] || 'unknown';

      line += deltaLine;
      if (deltaLine > 0) char = deltaChar;
      else char += deltaChar;

      tokens.push({ line, char, length, tokenType });
    }

    return tokens;
  }

  private sendNotification(method: string, params: any): void {
    const message = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params
    });

    const headers = `Content-Length: ${message.length}\r\n\r\n`;
    this.lsp?.stdin?.write(headers + message);
  }

  private sendRequest(method: string, params: any): Promise<any> {
    const id = this.messageId++;
    const message = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    });

    const headers = `Content-Length: ${message.length}\r\n\r\n`;

    return new Promise((resolve) => {
      this.pendingRequests.set(id, resolve);
      this.lsp?.stdin?.write(headers + message);
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
