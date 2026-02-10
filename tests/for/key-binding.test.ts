import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('/for key/value binding', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
  });

  it('binds explicit key variables and omits implicit value_key', async () => {
    const input = `
/var @obj = {"a": 1, "b": 2}
/var @arr = [10]
/var @pairs = for @k, @v in @obj => \`@k=@v\`
/var @keyCheck = for @k, @v in @obj => @v_key.isDefined()
/var @arrayKeys = for @k, @v in @arr => @k
/show \`Pairs: @pairs\`
/show \`Key/value implicit: @keyCheck\`
/show \`Array keys: @arrayKeys\`
`;

    const output = await interpret(input, { fileSystem, pathService });
    const lines = output.trim().split('\n').filter(Boolean);
    const pairsLine = lines.find(line => line.startsWith('Pairs: '));
    const implicitLine = lines.find(line => line.startsWith('Key/value implicit: '));
    const arrayKeysLine = lines.find(line => line.startsWith('Array keys: '));

    expect(pairsLine).toBeTruthy();
    expect(implicitLine).toBeTruthy();
    expect(arrayKeysLine).toBeTruthy();

    const pairs = JSON.parse((pairsLine as string).slice('Pairs: '.length));
    const implicit = JSON.parse((implicitLine as string).slice('Key/value implicit: '.length));
    const arrayKeys = JSON.parse((arrayKeysLine as string).slice('Array keys: '.length));

    expect(pairs).toEqual(['a=1', 'b=2']);
    expect(implicit).toEqual([false, false]);
    expect(arrayKeys).toEqual(['0']);
  });

  it('throws when dotted bindings reference missing fields', async () => {
    const input = `
/var @files = [{ "name": "alpha" }]
/for @file.path in @files => show @file.path
`;

    await expect(
      interpret(input, { fileSystem, pathService })
    ).rejects.toThrow('Field "path" not found in object in for binding @file.path (key 0)');
  });
});
