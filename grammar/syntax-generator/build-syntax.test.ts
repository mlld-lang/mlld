import { describe, it, expect } from 'vitest';
import MlldSyntaxGenerator from './build-syntax.js';

describe('MlldSyntaxGenerator', () => {
  const generator = new MlldSyntaxGenerator();

  it('includes newer directive families in the generated keyword list', () => {
    expect(generator.directives).toEqual(expect.arrayContaining([
      'auth',
      'box',
      'file',
      'files',
      'record',
      'store',
      'needs',
      'profiles',
      'while'
    ]));
  });

  it('keeps regex patterns aligned with newer keyword forms', () => {
    expect(generator.patterns.guardFilter).toContain('named:');
    expect(generator.patterns.guardFilter).toContain('log');
    expect(generator.patterns.guardFilter).toContain('stream');
    expect(generator.patterns.arrowOperator).toContain('=->');
    expect(generator.patterns.arrowOperator).toContain('=>');
    expect(generator.patterns.arrowOperator).toContain('->');
    expect(generator.patterns.operators).toContain('tools');
    expect(generator.patterns.operators).toContain('mcp');
    expect(generator.patterns.operators).toContain('using');
    expect(generator.patterns.operators).toContain('record');
    expect(generator.patterns.operators).toContain('known');
    expect(generator.patterns.operators).toContain('trusted');
    expect(generator.patterns.operators).toContain('resolved');
    expect(generator.patterns.operators).toContain('privileged');
    expect(generator.patterns.directiveForms).toContain('profiles');
    expect(generator.patterns.directiveForms).toContain('loop');
  });

  it('supports hyphenated identifiers in variable and object-key patterns', () => {
    const variableRegex = new RegExp(`^${generator.patterns.variable}$`);
    expect(variableRegex.test('@max-iterations')).toBe(true);

    const objectKeyRegex = new RegExp(generator.patterns.objectKey);
    expect('max-retries: 3'.match(objectKeyRegex)?.[0]).toBe('max-retries');
    expect('facts: [email: string]'.match(objectKeyRegex)?.[0]).toBe('facts');
    expect('data: [notes: string?]'.match(objectKeyRegex)?.[0]).toBe('data');
    expect('trusted: [subject: string?]'.match(objectKeyRegex)?.[0]).toBe('trusted');
    expect('untrusted: [body: string]'.match(objectKeyRegex)?.[0]).toBe('untrusted');
    expect('display: [name, { mask: "email" }]'.match(objectKeyRegex)?.[0]).toBe('display');
    expect('key: recipient'.match(objectKeyRegex)?.[0]).toBe('key');
    expect('correlate: true'.match(objectKeyRegex)?.[0]).toBe('correlate');
    expect('exact: [subject]'.match(objectKeyRegex)?.[0]).toBe('exact');
    expect('update: [body]'.match(objectKeyRegex)?.[0]).toBe('update');
    expect('allowlist: { recipient: @approvedRecipients }'.match(objectKeyRegex)?.[0]).toBe('allowlist');
    expect('blocklist: { recipient: ["blocked-recipient"] }'.match(objectKeyRegex)?.[0]).toBe('blocklist');
    expect('optional_benign: [cc]'.match(objectKeyRegex)?.[0]).toBe('optional_benign');
    expect('validate: "strict"'.match(objectKeyRegex)?.[0]).toBe('validate');
    expect('inputs: @send_email_inputs'.match(objectKeyRegex)?.[0]).toBe('inputs');
    expect('labels: ["execute:w"]'.match(objectKeyRegex)?.[0]).toBe('labels');
    expect('description: "Send a message"'.match(objectKeyRegex)?.[0]).toBe('description');
    expect('instructions: "Prefer drafts first"'.match(objectKeyRegex)?.[0]).toBe('instructions');
    expect('can_authorize: { role:planner: [@sendEmail] }'.match(objectKeyRegex)?.[0]).toBe('can_authorize');
    expect('role:planner: [name, { ref: "email" }]'.match(objectKeyRegex)?.[0]).toBe('role:planner');
    expect('{ mask: "email" }'.match(objectKeyRegex)?.[0]).toBe('mask');
  });

  it('emits inline and block keyword patterns for TextMate grammars', () => {
    const patternNames = generator.generateTextMatePatterns().map(pattern => pattern.name);
    expect(patternNames).toContain('keyword.control.directive.inline.mlld');
    expect(patternNames).toContain('keyword.control.block.mlld');
    expect(patternNames).toContain('keyword.control.flow.mlld');
    expect(patternNames).toContain('support.type.property-name.mlld');
  });

  it('matches canonical named operation filters in regex highlighters', () => {
    const guardFilterRegex = new RegExp(generator.patterns.guardFilter, 'g');

    expect('op:named:sendEmail'.match(guardFilterRegex)?.[0]).toBe('op:named:sendEmail');
    expect('op:named:claudePoll("review")'.match(guardFilterRegex)?.[0]).toBe('op:named:claudePoll');
    expect('op:run'.match(guardFilterRegex)?.[0]).toBe('op:run');
  });
});
