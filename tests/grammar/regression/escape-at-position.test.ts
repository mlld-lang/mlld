import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';

function findVarDirective(ast: any[], name: string): any {
  const directive = ast.find(
    node => node?.kind === 'var' && node?.values?.identifier?.[0]?.identifier === name
  );
  expect(directive).toBeDefined();
  return directive;
}

describe('Escape sequence position regressions', () => {
  it('parses backtick @@ and \\@ escapes at start and after variables', () => {
    const ast = parseSync(
      [
        '/var @user = "alice"',
        '/var @start = `@@literal`',
        '/var @after = `@user@@domain`',
        '/var @slashAfter = `@user\\@domain`'
      ].join('\n')
    ) as any[];

    const start = findVarDirective(ast, 'start');
    expect(start?.meta?.rawTemplate).toBe('@literal');

    const after = findVarDirective(ast, 'after');
    const afterNodes = after?.values?.value ?? [];
    const afterVarRefs = afterNodes.filter((node: any) => node?.type === 'VariableReference');
    const afterText = afterNodes
      .filter((node: any) => node?.type === 'Text')
      .map((node: any) => node.content)
      .join('');
    expect(afterVarRefs.map((node: any) => node.identifier)).toEqual(['user']);
    expect(afterText).toBe('@domain');

    const slashAfter = findVarDirective(ast, 'slashAfter');
    const slashAfterNodes = slashAfter?.values?.value ?? [];
    const slashAfterVarRefs = slashAfterNodes.filter((node: any) => node?.type === 'VariableReference');
    const slashAfterText = slashAfterNodes
      .filter((node: any) => node?.type === 'Text')
      .map((node: any) => node.content)
      .join('');

    expect(slashAfterVarRefs.map((node: any) => node.identifier)).toEqual(['user']);
    expect(slashAfterVarRefs[0]?.boundary).toEqual({ type: 'literal', value: '@' });
    expect(slashAfterText).toBe('domain');
  });

  it('parses prose escapes without creating a second variable after \\@', () => {
    const ast = parseSync(
      [
        '/exe @start(cfg) = prose:@cfg { @@literal }',
        '/exe @post(cfg, user) = prose:@cfg { @user\\@domain }'
      ].join('\n')
    ) as any[];

    const startExe = ast.find(
      node => node?.kind === 'exe' && node?.values?.identifier?.[0]?.identifier === 'start'
    );
    expect(startExe).toBeDefined();
    const startContent = (startExe?.values?.content ?? [])
      .filter((node: any) => node?.type === 'Text')
      .map((node: any) => node.content)
      .join('');
    expect(startContent).toContain('@literal');
    expect(startContent).not.toContain('@@literal');

    const postExe = ast.find(
      node => node?.kind === 'exe' && node?.values?.identifier?.[0]?.identifier === 'post'
    );
    expect(postExe).toBeDefined();
    const postNodes = postExe?.values?.content ?? [];
    const postVarRefs = postNodes.filter((node: any) => node?.type === 'VariableReference');
    const postText = postNodes
      .filter((node: any) => node?.type === 'Text')
      .map((node: any) => node.content)
      .join('');

    expect(postVarRefs.map((node: any) => node.identifier)).toEqual(['user']);
    expect(postVarRefs[0]?.boundary).toEqual({ type: 'literal', value: '@' });
    expect(postText).toContain('domain');
  });
});
