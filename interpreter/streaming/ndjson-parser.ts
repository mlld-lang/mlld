/**
 * Minimal NDJSON parser with line buffering.
 * - Accumulates partial lines across chunks
 * - Returns parsed JSON objects for complete lines
 * - Silently skips lines that fail JSON.parse
 */
export class NDJSONParser {
  private buffer = '';

  processChunk(chunk: string): any[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    const results: any[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        results.push(JSON.parse(trimmed));
      } catch {
        // ignore malformed lines
      }
    }
    return results;
  }

  flush(): any[] {
    const trimmed = this.buffer.trim();
    if (!trimmed) {
      this.buffer = '';
      return [];
    }
    this.buffer = '';
    try {
      return [JSON.parse(trimmed)];
    } catch {
      return [];
    }
  }
}
