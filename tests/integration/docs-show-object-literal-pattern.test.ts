import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import * as fs from 'fs/promises';

const sourcePatterns = ['docs/**/*.{md,mld,att}', 'plugins/**/*.{md,mld,att}'];
const sourceFiles = sourcePatterns
  .flatMap(pattern => glob.sync(pattern, { nodir: true, ignore: ['**/node_modules/**'] }))
  .sort();

const inlineShowObjectLiteralPattern =
  /(?:^|\n)\s*\/?show\s*\{(?!\{)\s*(?:\n\s*)?(?:[A-Za-z_][\w-]*|["'][^"'\n]+["'])\s*:/g;

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

describe('docs examples avoid inline object literals after show', () => {
  it('does not contain `show { key: value }` patterns', async () => {
    const offenders: string[] = [];

    for (const file of sourceFiles) {
      const content = await fs.readFile(file, 'utf8');
      inlineShowObjectLiteralPattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = inlineShowObjectLiteralPattern.exec(content)) !== null) {
        const lineNumber = getLineNumber(content, match.index);
        offenders.push(`${file}:${lineNumber}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
