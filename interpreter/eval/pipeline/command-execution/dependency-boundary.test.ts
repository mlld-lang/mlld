import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const CURRENT_DIR = path.dirname(CURRENT_FILE);
const HANDLERS_DIR = path.join(CURRENT_DIR, 'handlers');

describe('command-execution dependency boundaries', () => {
  it('keeps handlers independent from orchestrator module imports', async () => {
    const files = await fs.readdir(HANDLERS_DIR);
    const handlerFiles = files.filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));
    const orchestratorImportPattern = /from\s+['"][^'"]*command-execution(?:\.ts)?['"]/;

    for (const file of handlerFiles) {
      const fullPath = path.join(HANDLERS_DIR, file);
      const source = await fs.readFile(fullPath, 'utf8');
      expect(source, `${file} imports orchestrator`).not.toMatch(orchestratorImportPattern);
    }
  });
});
