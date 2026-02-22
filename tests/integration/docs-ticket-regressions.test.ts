import { describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

async function readDoc(relativePath: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relativePath), 'utf8');
}

describe('docs ticket regressions', () => {
  it('m-96e5: exe-simple documents typed python parameters', async () => {
    const content = await readDoc('docs/src/atoms/commands/exe-simple.md');
    expect(content).toContain('Parameters preserve their original mlld types');
    expect(content).not.toContain('Parameters arrive as strings');
  });

  it('m-4666: pipelines-context describes @mx.stage as numeric index', async () => {
    const content = await readDoc('docs/src/atoms/syntax/pipelines-context.md');
    expect(content).toContain('current 1-based stage index');
    expect(content).toContain('stage=1');
    expect(content).not.toContain('current stage name');
  });

  it('m-a107: for-context explains parallel ordering and recommends @item.mx.index', async () => {
    const content = await readDoc('docs/src/atoms/control-flow/for-context.md');
    expect(content).toContain('completion order');
    expect(content).toContain('@item.mx.index');
    expect(content).not.toContain('preserves original array position');
  });

  it('m-5f92 and m-4ee7: log docs use directive syntax and avoid reserved @debug variable names', async () => {
    const builtins = await readDoc('docs/src/atoms/syntax/builtins.md');
    const log = await readDoc('docs/src/atoms/commands/log.md');

    expect(builtins).toContain('log <value>');
    expect(builtins).not.toContain('@log(message)');

    expect(log).toContain('@debugMode');
    expect(log).not.toContain('when @debug =>');
    expect(log).not.toContain('@log(');
  });

  it('m-36d3: env docs do not show invalid `var @x = @y with {}` examples', async () => {
    const overview = await readDoc('docs/src/atoms/security/env-overview.md');
    const blocks = await readDoc('docs/src/atoms/security/env-blocks.md');
    const invalidPattern = /var\s+@\w+\s*=\s*@\w+\s+with\s*\{/;

    expect(overview).not.toMatch(invalidPattern);
    expect(blocks).not.toMatch(invalidPattern);
    expect(blocks).toContain('env @sandbox with { tools: ["Read"] }');
  });

  it('m-fbec and m-8a48: gotchas includes truthiness table and reserved names quick-reference', async () => {
    const content = await readDoc('docs/src/atoms/mistakes/gotchas.md');

    expect(content).toContain('Truthiness rules');
    expect(content).toContain('`[]` (empty array)');
    expect(content).toContain('`{}` (empty object)');
    expect(content).toContain('JavaScript users: this differs from JS');

    expect(content).toContain('Reserved names quick-reference');
    expect(content).toContain('@input');
    expect(content).toContain('@mx');
    expect(content).toContain('@typeInfo');
    expect(content).toContain('@keepStructured');
  });

  it('m-ea89: corrected labels-trust, variables-conditional, and labels-overview wording', async () => {
    const labelsTrust = await readDoc('docs/src/atoms/security/labels-trust.md');
    const varsConditional = await readDoc('docs/src/atoms/syntax/variables-conditional.md');
    const labelsOverview = await readDoc('docs/src/atoms/security/labels-overview.md');

    expect(labelsTrust).not.toContain('warning logged');
    expect(varsConditional).toContain('>> Output: --tools json');
    expect(varsConditional).not.toContain('>> Output: --tools "json"');
    expect(labelsOverview).toContain('file paths and guard names');
    expect(labelsOverview).not.toContain('Transformation trail showing how data got here');
  });

  it('m-8a10: reserved-variables explains @root discovery markers', async () => {
    const content = await readDoc('docs/src/atoms/syntax/reserved-variables.md');

    expect(content).toContain('@root`/`@base` resolution algorithm');
    expect(content).toContain('mlld-config.json');
    expect(content).toContain('mlld-lock.json');
    expect(content).toContain('mlld.lock.json');
    expect(content).toContain('package.json');
    expect(content).toContain('.git');
    expect(content).toContain('pyproject.toml');
    expect(content).toContain('Cargo.toml');
  });

  it('m-6d81: key guide pages include See Also cross-references', async () => {
    const docs = [
      'docs/src/atoms/syntax/escaping-basics.md',
      'docs/src/atoms/syntax/file-loading-basics.md',
      'docs/src/atoms/commands/exe-simple.md',
      'docs/src/atoms/commands/output.md',
      'docs/src/atoms/commands/log.md',
      'docs/src/atoms/syntax/variables-basics.md'
    ];

    for (const docPath of docs) {
      const content = await readDoc(docPath);
      expect(content).toContain('## See Also');
      expect(content).toMatch(/- \[[^\]]+\]\([^)]+\) - /);
    }
  });

  it('m-73be: output docs list all supported format specifiers', async () => {
    const content = await readDoc('docs/src/atoms/commands/output.md');

    expect(content).toContain('as json');
    expect(content).toContain('as yaml');
    expect(content).toContain('as text');
    expect(content).toContain('Supported format specifiers');
  });
});
