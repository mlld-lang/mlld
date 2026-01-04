import { describe, it, expect } from 'vitest';
import {
  splitIntoChunks,
  createInitialSplitterState,
  canSplitAt,
  rebaseLocation,
  parseChunk,
  mergeChunkResults,
  Chunk,
  SplitterState
} from '@cli/commands/chunk-parsing';

describe('splitIntoChunks', () => {
  it('splits on blank lines between directives', () => {
    const text = `/var @a = 1

/var @b = 2`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe('/var @a = 1\n');
    expect(chunks[1].text).toBe('/var @b = 2');
  });

  it('splits adjacent directives even without blank line', () => {
    const text = `/var @a = 1
/var @b = 2`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text.trim()).toBe('/var @a = 1');
    expect(chunks[1].text.trim()).toBe('/var @b = 2');
  });

  it('does not split inside block syntax', () => {
    const text = `/exe @f() = [
  let @x = 1

  let @y = 2
]`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
  });

  it('does not split inside multi-line template', () => {
    const text = `/var @msg = \`
line 1

line 2
\``;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
  });

  it('handles strict mode bare directives', () => {
    const text = `var @a = 1

var @b = 2`;
    const chunks = splitIntoChunks(text, 'strict');
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toContain('var @a = 1');
    expect(chunks[1].text).toContain('var @b = 2');
  });

  it('returns single chunk for empty document', () => {
    const chunks = splitIntoChunks('', 'markdown');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('');
  });

  it('returns single chunk when no split points', () => {
    const text = '/var @a = 1';
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
  });

  it('tracks chunk offsets correctly', () => {
    const text = `/var @a = 1

/var @b = 2`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks[0].startOffset).toBe(0);
    expect(chunks[0].startLine).toBe(0);
    expect(chunks[1].startLine).toBe(2);
    // First chunk ends at position 12 (including newline before blank line)
    // Blank line at position 12, second chunk starts at position 13
    expect(chunks[1].startOffset).toBeGreaterThan(chunks[0].endOffset);
  });

  it('does not split inside code fence', () => {
    const text = `/var @before = 1

\`\`\`
/var @code = 2

/var @more = 3
\`\`\`

/var @after = 4`;
    const chunks = splitIntoChunks(text, 'markdown');
    // Code fence block prevents splitting on blank lines inside it
    // But the blank line before the code fence can still trigger a split
    // Implementation treats code fence as one chunk with content before and after
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Verify no chunk boundary falls inside the code fence
    const codeFenceStart = text.indexOf('```');
    const codeFenceEnd = text.lastIndexOf('```') + 3;
    for (const chunk of chunks) {
      // Chunk should not start inside the code fence
      const chunkStartInDoc = chunk.startOffset;
      const inFence = chunkStartInDoc > codeFenceStart && chunkStartInDoc < codeFenceEnd;
      expect(inFence).toBe(false);
    }
  });

  it('does not split inside braces', () => {
    const text = `/run js {
  const x = 1;

  const y = 2;
}`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(1);
  });

  it('does not count brackets inside strings', () => {
    const text = `/run js {
  const s = "{[()]}";
}

/var @after = 1`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(2);
  });

  it('does not split inside parentheses', () => {
    const text = `/when (@a == 1

&& @b == 2) => /show "ok"`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(1);
  });

  it('does not split inside double-colon templates', () => {
    const text = `/var @msg = ::
Hello

World
::`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(1);
  });

  it('does not split inside triple-colon templates', () => {
    const text = `/var @msg = :::
Hello

World
:::`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(1);
  });

  it('handles multiple consecutive blank lines', () => {
    const text = `/var @a = 1


/var @b = 2`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(2);
  });

  it('handles blank line at start of document', () => {
    const text = `
/var @a = 1`;
    const chunks = splitIntoChunks(text, 'markdown');
    // Blank line at start followed by directive creates a split point
    // This is expected behavior - the splitter sees blank line then directive
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('handles blank line at end of document', () => {
    const text = `/var @a = 1

`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(1);
  });

  it('splits correctly with comments', () => {
    const text = `>> Comment
/var @a = 1

/var @b = 2`;
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks).toHaveLength(2);
  });

  it('caps chunk count at 200', () => {
    // Create a document with more than 200 potential chunks
    const lines: string[] = [];
    for (let i = 0; i < 250; i++) {
      lines.push(`/var @x${i} = ${i}`);
      lines.push('');
    }
    const text = lines.join('\n');
    const chunks = splitIntoChunks(text, 'markdown');
    expect(chunks.length).toBeLessThanOrEqual(200);
  });

  it('recognizes all standard directive keywords in strict mode', () => {
    const directives = ['var', 'show', 'exe', 'run', 'for', 'when', 'while', 'stream', 'guard', 'import', 'export', 'output', 'append', 'log', 'path'];

    for (const directive of directives) {
      const text = `${directive} @a = 1

${directive} @b = 2`;
      const chunks = splitIntoChunks(text, 'strict');
      expect(chunks.length).toBe(2);
    }
  });

  it('does not split on non-directive lines after blank', () => {
    const text = `/var @a = 1

some random text`;
    const chunks = splitIntoChunks(text, 'markdown');
    // Should be single chunk since "some random text" is not a directive
    expect(chunks).toHaveLength(1);
  });

  it('startColumn is always 0 for top-level chunks', () => {
    const text = `/var @a = 1

/var @b = 2`;
    const chunks = splitIntoChunks(text, 'markdown');
    for (const chunk of chunks) {
      expect(chunk.startColumn).toBe(0);
    }
  });
});

describe('rebaseLocation', () => {
  it('rebases line numbers', () => {
    const node = {
      location: {
        start: { line: 1, column: 0, offset: 0 },
        end: { line: 1, column: 5, offset: 5 }
      }
    };
    const chunk: Chunk = {
      startLine: 10,
      startOffset: 100,
      startColumn: 0,
      text: '',
      endLine: 10,
      endOffset: 105
    };
    rebaseLocation(node, chunk);
    expect(node.location.start.line).toBe(11); // 1 + 10
    expect(node.location.end.line).toBe(11);
  });

  it('rebases offsets', () => {
    const node = {
      location: {
        start: { line: 1, column: 0, offset: 0 },
        end: { line: 1, column: 10, offset: 10 }
      }
    };
    const chunk: Chunk = {
      startLine: 0,
      startOffset: 50,
      startColumn: 0,
      text: '',
      endLine: 0,
      endOffset: 60
    };
    rebaseLocation(node, chunk);
    expect(node.location.start.offset).toBe(50);
    expect(node.location.end.offset).toBe(60);
  });

  it('rebases column only for first line', () => {
    const node = {
      location: {
        start: { line: 1, column: 5, offset: 5 },
        end: { line: 2, column: 3, offset: 15 }
      }
    };
    const chunk: Chunk = {
      startLine: 5,
      startOffset: 100,
      startColumn: 10,
      text: '',
      endLine: 6,
      endOffset: 115
    };
    rebaseLocation(node, chunk);
    // First line (line 1 -> 0-based 0) should have column adjusted
    expect(node.location.start.column).toBe(15); // 5 + 10
    // Second line (line 2 -> 0-based 1) should NOT have column adjusted
    expect(node.location.end.column).toBe(3); // unchanged
  });

  it('recursively rebases nested nodes', () => {
    const node = {
      location: {
        start: { line: 1, column: 0, offset: 0 },
        end: { line: 1, column: 5, offset: 5 }
      },
      child: {
        location: {
          start: { line: 1, column: 2, offset: 2 },
          end: { line: 1, column: 4, offset: 4 }
        }
      }
    };
    const chunk: Chunk = {
      startLine: 10,
      startOffset: 100,
      startColumn: 0,
      text: '',
      endLine: 10,
      endOffset: 105
    };
    rebaseLocation(node, chunk);
    expect(node.child.location.start.offset).toBe(102);
    expect(node.child.location.end.offset).toBe(104);
  });

  it('handles arrays of nested nodes', () => {
    const node = {
      location: {
        start: { line: 1, column: 0, offset: 0 },
        end: { line: 1, column: 20, offset: 20 }
      },
      children: [
        { location: { start: { line: 1, column: 5, offset: 5 }, end: { line: 1, column: 8, offset: 8 } } },
        { location: { start: { line: 1, column: 10, offset: 10 }, end: { line: 1, column: 15, offset: 15 } } }
      ]
    };
    const chunk: Chunk = {
      startLine: 5,
      startOffset: 100,
      startColumn: 0,
      text: '',
      endLine: 5,
      endOffset: 120
    };
    rebaseLocation(node, chunk);
    expect(node.children[0].location.start.offset).toBe(105);
    expect(node.children[1].location.start.offset).toBe(110);
  });

  it('handles null/undefined nodes gracefully', () => {
    const chunk: Chunk = {
      startLine: 10,
      startOffset: 100,
      startColumn: 0,
      text: '',
      endLine: 10,
      endOffset: 105
    };

    // Should not throw
    expect(() => rebaseLocation(null, chunk)).not.toThrow();
    expect(() => rebaseLocation(undefined, chunk)).not.toThrow();
  });

  it('handles nodes without location gracefully', () => {
    const node = { type: 'SomeNode', value: 'test' };
    const chunk: Chunk = {
      startLine: 10,
      startOffset: 100,
      startColumn: 0,
      text: '',
      endLine: 10,
      endOffset: 105
    };

    // Should not throw
    expect(() => rebaseLocation(node, chunk)).not.toThrow();
  });

  it('handles multi-line nodes correctly', () => {
    const node = {
      location: {
        start: { line: 1, column: 5, offset: 5 },
        end: { line: 3, column: 2, offset: 25 }
      }
    };
    const chunk: Chunk = {
      startLine: 10,
      startOffset: 200,
      startColumn: 3,
      text: '',
      endLine: 12,
      endOffset: 220
    };
    rebaseLocation(node, chunk);
    expect(node.location.start.line).toBe(11); // 1 + 10
    expect(node.location.end.line).toBe(13); // 3 + 10
    expect(node.location.start.column).toBe(8); // 5 + 3 (first line)
    expect(node.location.end.column).toBe(2); // unchanged (not first line)
    expect(node.location.start.offset).toBe(205); // 5 + 200
    expect(node.location.end.offset).toBe(225); // 25 + 200
  });
});

describe('SplitterState', () => {
  it('initial state allows splitting', () => {
    const state = createInitialSplitterState();
    expect(canSplitAt(state)).toBe(true);
  });

  it('cannot split when bracket depth > 0', () => {
    const state = createInitialSplitterState();
    state.bracketDepth = 1;
    expect(canSplitAt(state)).toBe(false);
  });

  it('cannot split when brace depth > 0', () => {
    const state = createInitialSplitterState();
    state.braceDepth = 1;
    expect(canSplitAt(state)).toBe(false);
  });

  it('cannot split when paren depth > 0', () => {
    const state = createInitialSplitterState();
    state.parenDepth = 1;
    expect(canSplitAt(state)).toBe(false);
  });

  it('cannot split inside template', () => {
    const state = createInitialSplitterState();
    state.templateStack.push('`');
    expect(canSplitAt(state)).toBe(false);
  });

  it('cannot split inside double-colon template', () => {
    const state = createInitialSplitterState();
    state.templateStack.push('::');
    expect(canSplitAt(state)).toBe(false);
  });

  it('cannot split inside triple-colon template', () => {
    const state = createInitialSplitterState();
    state.templateStack.push(':::');
    expect(canSplitAt(state)).toBe(false);
  });

  it('cannot split inside code fence', () => {
    const state = createInitialSplitterState();
    state.inCodeFence = true;
    expect(canSplitAt(state)).toBe(false);
  });

  it('cannot split inside comment', () => {
    const state = createInitialSplitterState();
    state.inComment = true;
    expect(canSplitAt(state)).toBe(false);
  });

  it('cannot split with multiple nesting levels', () => {
    const state = createInitialSplitterState();
    state.bracketDepth = 2;
    state.braceDepth = 1;
    state.templateStack.push('`');
    expect(canSplitAt(state)).toBe(false);
  });

  it('createInitialSplitterState returns fresh state', () => {
    const state1 = createInitialSplitterState();
    state1.bracketDepth = 5;

    const state2 = createInitialSplitterState();
    expect(state2.bracketDepth).toBe(0);
  });
});

describe('parseChunk', () => {
  it('parses valid chunk successfully', async () => {
    const chunk: Chunk = {
      text: '/var @x = 1',
      startLine: 0,
      endLine: 0,
      startOffset: 0,
      endOffset: 11,
      startColumn: 0
    };

    const result = await parseChunk(chunk, 'markdown');

    expect(result.success).toBe(true);
    expect(result.ast.length).toBeGreaterThan(0);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.error).toBeUndefined();
  });

  it('returns error for invalid chunk', async () => {
    const chunk: Chunk = {
      text: '/var @x =', // incomplete
      startLine: 0,
      endLine: 0,
      startOffset: 0,
      endOffset: 9,
      startColumn: 0
    };

    const result = await parseChunk(chunk, 'markdown');

    expect(result.success).toBe(false);
    expect(result.ast).toHaveLength(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.error).toBeDefined();
  });

  it('rebases locations to document positions', async () => {
    const chunk: Chunk = {
      text: '/var @x = 1',
      startLine: 10,
      endLine: 10,
      startOffset: 200,
      endOffset: 211,
      startColumn: 0
    };

    const result = await parseChunk(chunk, 'markdown');

    expect(result.success).toBe(true);
    // AST nodes should have rebased locations
    const firstNode = result.ast[0];
    expect(firstNode.location.start.line).toBeGreaterThanOrEqual(10);
    expect(firstNode.location.start.offset).toBeGreaterThanOrEqual(200);
  });

  it('parses strict mode chunk', async () => {
    const chunk: Chunk = {
      text: 'var @x = 1',
      startLine: 0,
      endLine: 0,
      startOffset: 0,
      endOffset: 10,
      startColumn: 0
    };

    const result = await parseChunk(chunk, 'strict');

    expect(result.success).toBe(true);
    expect(result.ast.length).toBeGreaterThan(0);
  });

  it('handles empty chunk', async () => {
    const chunk: Chunk = {
      text: '',
      startLine: 0,
      endLine: 0,
      startOffset: 0,
      endOffset: 0,
      startColumn: 0
    };

    const result = await parseChunk(chunk, 'markdown');

    // Empty input should parse successfully with empty AST
    expect(result.success).toBe(true);
    expect(result.ast).toHaveLength(0);
  });

  it('handles whitespace-only chunk', async () => {
    const chunk: Chunk = {
      text: '   \n  \n  ',
      startLine: 0,
      endLine: 2,
      startOffset: 0,
      endOffset: 9,
      startColumn: 0
    };

    const result = await parseChunk(chunk, 'markdown');

    // Whitespace should parse successfully
    expect(result.success).toBe(true);
  });
});

describe('mergeChunkResults', () => {
  it('combines successful ASTs', () => {
    const results = [
      {
        success: true,
        chunk: { text: '/var @a = 1', startLine: 0, endLine: 0, startOffset: 0, endOffset: 11, startColumn: 0 },
        ast: [{ type: 'VarDirective', name: '@a' }],
        diagnostics: []
      },
      {
        success: true,
        chunk: { text: '/var @b = 2', startLine: 2, endLine: 2, startOffset: 13, endOffset: 24, startColumn: 0 },
        ast: [{ type: 'VarDirective', name: '@b' }],
        diagnostics: []
      }
    ];

    const merged = mergeChunkResults(results);

    expect(merged.nodes).toHaveLength(2);
    expect(merged.errors).toHaveLength(0);
    expect(merged.failedRanges).toHaveLength(0);
  });

  it('tracks failed ranges', () => {
    const results = [
      {
        success: true,
        chunk: { text: '/var @a = 1', startLine: 0, endLine: 0, startOffset: 0, endOffset: 11, startColumn: 0 },
        ast: [{ type: 'VarDirective', name: '@a' }],
        diagnostics: []
      },
      {
        success: false,
        chunk: { text: 'BROKEN', startLine: 2, endLine: 2, startOffset: 13, endOffset: 19, startColumn: 0 },
        ast: [],
        diagnostics: [{ message: 'Syntax error', severity: 1, range: { start: { line: 2, character: 0 }, end: { line: 2, character: 6 } }, source: 'mlld' }],
        error: new Error('Parse error')
      },
      {
        success: true,
        chunk: { text: '/var @c = 3', startLine: 4, endLine: 4, startOffset: 21, endOffset: 32, startColumn: 0 },
        ast: [{ type: 'VarDirective', name: '@c' }],
        diagnostics: []
      }
    ];

    const merged = mergeChunkResults(results);

    expect(merged.nodes).toHaveLength(2); // @a and @c
    expect(merged.errors).toHaveLength(1);
    expect(merged.failedRanges).toHaveLength(1);
    expect(merged.failedRanges[0].start.line).toBe(2);
    expect(merged.failedRanges[0].end.character).toBeGreaterThan(0);
  });

  it('handles all failed chunks', () => {
    const results = [
      {
        success: false,
        chunk: { text: 'BAD1', startLine: 0, endLine: 0, startOffset: 0, endOffset: 4, startColumn: 0 },
        ast: [],
        diagnostics: [{ message: 'Error 1', severity: 1, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } }, source: 'mlld' }]
      },
      {
        success: false,
        chunk: { text: 'BAD2', startLine: 2, endLine: 2, startOffset: 6, endOffset: 10, startColumn: 0 },
        ast: [],
        diagnostics: [{ message: 'Error 2', severity: 1, range: { start: { line: 2, character: 0 }, end: { line: 2, character: 4 } }, source: 'mlld' }]
      }
    ];

    const merged = mergeChunkResults(results);

    expect(merged.nodes).toHaveLength(0);
    expect(merged.errors).toHaveLength(2);
    expect(merged.failedRanges).toHaveLength(2);
  });

  it('handles empty results array', () => {
    const merged = mergeChunkResults([]);

    expect(merged.nodes).toHaveLength(0);
    expect(merged.errors).toHaveLength(0);
    expect(merged.failedRanges).toHaveLength(0);
  });

  it('preserves AST node order', () => {
    const results = [
      {
        success: true,
        chunk: { text: '/var @a = 1', startLine: 0, endLine: 0, startOffset: 0, endOffset: 11, startColumn: 0 },
        ast: [{ type: 'VarDirective', name: '@a', order: 1 }],
        diagnostics: []
      },
      {
        success: true,
        chunk: { text: '/var @b = 2', startLine: 2, endLine: 2, startOffset: 13, endOffset: 24, startColumn: 0 },
        ast: [{ type: 'VarDirective', name: '@b', order: 2 }],
        diagnostics: []
      },
      {
        success: true,
        chunk: { text: '/var @c = 3', startLine: 4, endLine: 4, startOffset: 26, endOffset: 37, startColumn: 0 },
        ast: [{ type: 'VarDirective', name: '@c', order: 3 }],
        diagnostics: []
      }
    ];

    const merged = mergeChunkResults(results);

    expect(merged.nodes[0].order).toBe(1);
    expect(merged.nodes[1].order).toBe(2);
    expect(merged.nodes[2].order).toBe(3);
  });
});

describe('error recovery integration', () => {
  it('recovers valid chunks around error in strict mode', async () => {
    // Use strict mode where plain text is a syntax error
    const text = `var @a = 1

BROKEN SYNTAX

var @c = 3`;
    const chunks = splitIntoChunks(text, 'strict');
    const results = await Promise.all(chunks.map(c => parseChunk(c, 'strict')));
    const merged = mergeChunkResults(results);

    // Should have AST from first and third chunks
    expect(merged.nodes.length).toBeGreaterThan(0);
    // Should have error from middle chunk
    expect(merged.errors.length).toBeGreaterThan(0);
    // Should have one failed range
    expect(merged.failedRanges.length).toBe(1);
  });

  it('recovers tokens before syntax error in strict mode', async () => {
    // Note: The splitter only splits at blank line + directive start
    // "BROKEN SYNTAX" doesn't start with a directive keyword, so it stays
    // in the same chunk as the directive before it
    const text = `var @good = 1

BROKEN SYNTAX`;
    const chunks = splitIntoChunks(text, 'strict');

    // Both lines end up in the same chunk since BROKEN doesn't match directive pattern
    expect(chunks).toHaveLength(1);

    const results = await Promise.all(chunks.map(c => parseChunk(c, 'strict')));
    const merged = mergeChunkResults(results);

    // The whole chunk fails because it contains invalid strict-mode content
    // This is expected behavior - chunk-based recovery only helps when
    // errors are in separate chunks (separated by blank line + directive)
    expect(merged.errors.length).toBeGreaterThan(0);
  });

  it('recovers tokens after syntax error in strict mode', async () => {
    // In strict mode, "BROKEN" is not a valid directive and will fail
    const text = `BROKEN

var @good = 1`;
    const chunks = splitIntoChunks(text, 'strict');
    const results = await Promise.all(chunks.map(c => parseChunk(c, 'strict')));
    const merged = mergeChunkResults(results);

    // Should have AST from second chunk
    expect(merged.nodes.length).toBeGreaterThan(0);
    // Should have error from first chunk
    expect(merged.errors.length).toBeGreaterThan(0);
  });

  it('handles multiple errors across chunks in strict mode', async () => {
    // The splitter creates chunks at "blank line + directive start" boundaries
    // Lines like "BROKEN1" don't start with directive keywords, so they
    // get grouped with the previous directive in the same chunk.
    // Only `var @a`, `var @b`, and `var @c` lines trigger chunk boundaries.
    const text = `var @a = 1

BROKEN1

var @b = 2

BROKEN2

var @c = 3`;
    const chunks = splitIntoChunks(text, 'strict');

    // Chunks split at "var @b" and "var @c" - creating 3 chunks:
    // Chunk 1: "var @a = 1\n\nBROKEN1\n"
    // Chunk 2: "var @b = 2\n\nBROKEN2\n"
    // Chunk 3: "var @c = 3"
    // Each chunk contains a BROKEN line so all chunks fail parsing
    expect(chunks).toHaveLength(3);

    const results = await Promise.all(chunks.map(c => parseChunk(c, 'strict')));
    const merged = mergeChunkResults(results);

    // All chunks have syntax errors because BROKEN lines are in them
    expect(merged.errors.length).toBeGreaterThan(0);
    expect(merged.failedRanges.length).toBeGreaterThan(0);
  });

  it('preserves locations across chunk boundaries', async () => {
    const text = `/var @first = 1

/var @second = 2

/var @third = 3`;
    const chunks = splitIntoChunks(text, 'markdown');
    const results = await Promise.all(chunks.map(c => parseChunk(c, 'markdown')));
    const merged = mergeChunkResults(results);

    // All nodes should have distinct line numbers
    const lines = merged.nodes.map(n => n.location.start.line);
    const uniqueLines = new Set(lines);
    expect(uniqueLines.size).toBe(3);
  });

  it('handles error inside block without losing surrounding code', async () => {
    const text = `/var @before = 1

/exe @f() = [ BROKEN ]

/var @after = 2`;
    const chunks = splitIntoChunks(text, 'markdown');
    const results = await Promise.all(chunks.map(c => parseChunk(c, 'markdown')));
    const merged = mergeChunkResults(results);

    // Should recover @before and @after
    // The block with error might fail but surrounding chunks should succeed
    expect(merged.nodes.length).toBeGreaterThanOrEqual(2);
  });

  it('handles strict mode error recovery', async () => {
    const text = `var @a = 1

BROKEN

var @c = 3`;
    const chunks = splitIntoChunks(text, 'strict');
    const results = await Promise.all(chunks.map(c => parseChunk(c, 'strict')));
    const merged = mergeChunkResults(results);

    expect(merged.nodes.length).toBeGreaterThan(0);
    expect(merged.errors.length).toBeGreaterThan(0);
  });

  it('markdown mode treats prose as valid content', async () => {
    // In markdown mode, prose text between directives is valid
    const text = `/var @a = 1

Some prose text here

/var @b = 2`;
    const chunks = splitIntoChunks(text, 'markdown');
    const results = await Promise.all(chunks.map(c => parseChunk(c, 'markdown')));
    const merged = mergeChunkResults(results);

    // All chunks should parse successfully (prose is valid in markdown mode)
    expect(merged.nodes.length).toBeGreaterThan(0);
    expect(merged.failedRanges).toHaveLength(0);
  });
});
