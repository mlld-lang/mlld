import { describe, it, expect } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

function getFirstDirective(source: string): DirectiveNode {
  const ast = parseSync(source);
  const directive = ast[0] as DirectiveNode;
  expect(directive).toBeDefined();
  return directive;
}

describe('Grammar security labels', () => {
  it('parses security labels on /var directives', () => {
    const directive = getFirstDirective('/var secret,untrusted @foo = "bar"');
    expect(directive.meta?.securityLabels).toEqual(['secret', 'untrusted']);
    expect(directive.values?.securityLabels).toEqual(['secret', 'untrusted']);
  });

  it('parses security labels on /run directives', () => {
    const directive = getFirstDirective('/run { echo hi } destructive,network');
    expect(directive.meta?.securityLabels).toEqual(['destructive', 'network']);
  });

  it('parses security labels on /exe directives', () => {
    const directive = getFirstDirective('/exe secret @hello() = run { echo hi }');
    expect(directive.meta?.securityLabels).toEqual(['secret']);
    expect(directive.values?.securityLabels).toEqual(['secret']);
  });

  it('parses security labels on /show directives', () => {
    const directive = getFirstDirective('/show public,trusted @message');
    expect(directive.meta?.securityLabels).toEqual(['public', 'trusted']);
  });

  it('parses security labels on /import directives', () => {
    const directive = getFirstDirective('/import module pii,secret { * as @ns } from "./mod"');
    expect(directive.meta?.securityLabels).toEqual(['pii', 'secret']);
    expect(directive.values?.securityLabels).toEqual(['pii', 'secret']);
  });
});
