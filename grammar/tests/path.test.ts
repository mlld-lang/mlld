import { describe, expect, test } from 'vitest';
import { parseSync } from '@grammar/parser';

describe('Path Directive Removal', () => {
  test('rejects legacy /path assignment syntax', async () => {
    expect(() => parseSync('/path @docs = "./docs"')).toThrow();
  });

  test('rejects /path with interpolation syntax', async () => {
    expect(() => parseSync('/path @config = "@base/config"')).toThrow();
  });

  test('rejects /path with escaped URL syntax', async () => {
    expect(() => parseSync('/path @social = "https://twitter.com/\\@username"')).toThrow();
  });

  test('rejects /path variable indirection syntax', async () => {
    expect(() => parseSync('/path @cfg = "@config_path"')).toThrow();
  });
});
