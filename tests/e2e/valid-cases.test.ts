/**
 * Test runner for valid Meld examples
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs/promises'; 
import { fileURLToPath } from 'url';
import { processMeld } from '@api/index.js'; 

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const validCasesDir = path.resolve(__dirname, '../cases/valid');

async function findMeldFiles(dir: string): Promise<string[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map(async (dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? findMeldFiles(res) : dirent.name.endsWith('.mld') ? res : null;
  }));
  return files.flat().filter((file): file is string => file !== null);
}

describe('Valid Meld Test Cases', async () => {
  const meldFiles = await findMeldFiles(validCasesDir);
  console.log(`Found ${meldFiles.length} valid test cases`);

  meldFiles.forEach((filePath) => {
    const testName = path.relative(validCasesDir, filePath);
    const expectedOutputPath = filePath.replace('.mld', '.expected');

    it(`processes ${testName} correctly`, async () => {
      const content = await fs.readFile(filePath, 'utf-8');
      
      const result = await processMeld(content); 

      let expectedOutput = '';
      try {
        expectedOutput = await fs.readFile(expectedOutputPath, 'utf-8');
      } catch (error: any) {
        if (error.code !== 'ENOENT') { 
          throw error;
        }
      }

      expect(result).toEqual(expectedOutput);
    });
  });
});