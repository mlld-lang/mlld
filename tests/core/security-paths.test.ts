import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAllDirsInPath } from '@core/security/paths';

function normalize(dirPath: string): string {
  const withForwardSlashes = dirPath.replace(/\\/g, '/');
  return process.platform === 'win32' ? withForwardSlashes.toLowerCase() : withForwardSlashes;
}

describe('getAllDirsInPath', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-sec-paths-'));
  const nestedDir = path.join(tmpRoot, 'app', 'config');
  const filePath = path.join(nestedDir, 'config.txt');
  const realTmpRoot = fs.realpathSync(tmpRoot);
  let realFilePath: string;

  beforeAll(() => {
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(filePath, 'config');
    realFilePath = fs.realpathSync(filePath);
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns all parent directories excluding root', () => {
    const dirs = getAllDirsInPath(realFilePath);
    const immediateParent = normalize(path.dirname(realFilePath));
    const root = normalize(path.parse(realFilePath).root);

    expect(dirs[0]).toBe(immediateParent);
    expect(dirs).toContain(normalize(realTmpRoot));
    expect(dirs).not.toContain(root);
  });

  it('resolves relative paths before computing directories', () => {
    const relativePath = path.relative(process.cwd(), realFilePath);
    const dirs = getAllDirsInPath(relativePath);
    const immediateParent = normalize(path.dirname(realFilePath));

    expect(dirs[0]).toBe(immediateParent);
  });

  it('follows symlinks when present', () => {
    if (process.platform === 'win32') {
      return;
    }
    const targetDir = path.join(realTmpRoot, 'shared', 'secrets');
    const targetFile = path.join(targetDir, 'secret.txt');
    const linkDir = path.join(tmpRoot, 'symlinked');

    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetFile, 'secret');
    fs.symlinkSync(targetDir, linkDir);

    const linkedFilePath = path.join(linkDir, 'secret.txt');
    const dirs = getAllDirsInPath(linkedFilePath);

    const normalizedTargetDir = normalize(fs.realpathSync(targetDir));
    expect(dirs[0]).toBe(normalizedTargetDir);
    expect(dirs).not.toContain(normalize(path.parse(normalizedTargetDir).root));
  });
});
