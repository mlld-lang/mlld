import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { normalizePolicyConfig } from '@core/policy/union';
import { evaluateFyiFacts } from './facts-runtime';

const HANDLE_RE = /^h_[a-z0-9]{6}$/;

async function createContactsEnv(): Promise<Environment> {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  const source = `
/record @contact = {
  facts: [email: string, id: string],
  data: [name: string]
}
/exe @emitContact() = js {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    id: "contact-1"
  };
} => contact
/var @contact = @emitContact()
`;
  const { ast } = await parse(source);
  await evaluate(ast, env);
  const contact = env.getVariable('contact');
  if (!contact) {
    throw new Error('Expected @contact to be defined');
  }
  env.setScopedEnvironmentConfig({
    fyi: {
      facts: [contact]
    }
  });
  return env;
}

describe('evaluateFyiFacts', () => {
  it('returns bounded fact candidates without exposing raw values', async () => {
    const env = await createContactsEnv();

    const result = await evaluateFyiFacts(undefined, env);

    expect(result.type).toBe('array');
    expect(result.data).toHaveLength(2);
    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada Lovelace',
        field: 'email',
        fact: 'fact:@contact.email'
      },
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada Lovelace',
        field: 'id',
        fact: 'fact:@contact.id'
      }
    ]);
    for (const candidate of result.data) {
      expect(candidate).not.toHaveProperty('value');
      expect(candidate.handle).toMatch(HANDLE_RE);
      expect(candidate.label).not.toContain('ada@example.com');
      expect(candidate.label).not.toContain('contact-1');
    }
  });

  it('filters send destinations to email facts by arg semantics', async () => {
    const env = await createContactsEnv();

    const result = await evaluateFyiFacts(
      { op: 'op:named:email.send', arg: 'recipient' },
      env
    );

    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada Lovelace',
        field: 'email',
        fact: 'fact:@contact.email'
      }
    ]);
  });

  it('supports bare-string op queries and groups candidates by arg', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    const source = `
/record @contact = {
  facts: [email: string]
  data: [name: string]
}
/exe @emitContact() = js {
  return { email: "mark@example.com", name: "Mark Davies" };
} => contact
/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = "sent" with {
  controlArgs: ["recipient"]
}
/var @contact = @emitContact()
`;
    const { ast } = await parse(source);
    await evaluate(ast, env);
    const contact = env.getVariable('contact');
    if (!contact) {
      throw new Error('Expected @contact to be defined');
    }
    env.setScopedEnvironmentConfig({
      fyi: {
        facts: [contact]
      }
    });

    const result = await evaluateFyiFacts('sendEmail', env);

    expect(result.type).toBe('object');
    expect(result.data).toEqual({
      recipient: [
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'Mark Davies',
          field: 'email',
          fact: 'fact:@contact.email'
        }
      ]
    });
  });

  it('supports bare-string op queries with a separate arg override', async () => {
    const env = await createContactsEnv();

    const result = await evaluateFyiFacts('email.send', env, 'recipient');

    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada Lovelace',
        field: 'email',
        fact: 'fact:@contact.email'
      }
    ]);
  });

  it('prefers live operation metadata for nonstandard control args', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    const source = `
/record @contact = {
  facts: [email: string]
}
/exe @emitContact() = js {
  return { email: "ada@example.com" };
} => contact
/exe exfil:send @createCalendarEvent(participants, title) = @participants with {
  controlArgs: ["participants"]
}
/var @contact = @emitContact()
`;
    const { ast } = await parse(source);
    await evaluate(ast, env);
    const contact = env.getVariable('contact');
    if (!contact) {
      throw new Error('Expected @contact to be defined');
    }
    env.setScopedEnvironmentConfig({
      fyi: {
        facts: [contact]
      }
    });

    const result = await evaluateFyiFacts(
      { op: 'op:named:createCalendarEvent', arg: 'participants' },
      env
    );

    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'a***@example.com',
        field: 'email',
        fact: 'fact:@contact.email'
      }
    ]);
  });

  it('filters destructive targets to id facts', async () => {
    const env = await createContactsEnv();

    const result = await evaluateFyiFacts(
      { op: 'op:named:crm.delete', arg: 'id' },
      env
    );

    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada Lovelace',
        field: 'id',
        fact: 'fact:@contact.id'
      }
    ]);
  });

  it('fails closed when only an arg name is provided without canonical operation identity', async () => {
    const env = await createContactsEnv();

    const result = await evaluateFyiFacts(
      { arg: 'recipient' },
      env
    );

    expect(result.data).toEqual([]);
  });

  it('applies stricter policy-derived requirements conjunctively', async () => {
    const env = await createContactsEnv();
    env.setPolicySummary(normalizePolicyConfig({
      defaults: {
        rules: ['no-send-to-external']
      }
    }));

    const result = await evaluateFyiFacts(
      { op: 'op:named:email.send', arg: 'recipient' },
      env
    );

    expect(result.data).toEqual([]);
  });

  it('resolves declarative fact requirements for non-built-in operations', async () => {
    const env = await createContactsEnv();
    env.setPolicySummary(normalizePolicyConfig({
      facts: {
        requirements: {
          '@createCalendarEvent': {
            participants: ['fact:*.email']
          }
        }
      }
    }));

    const result = await evaluateFyiFacts(
      { op: 'op:named:createCalendarEvent', arg: 'participants' },
      env
    );

    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada Lovelace',
        field: 'email',
        fact: 'fact:@contact.email'
      }
    ]);
  });

  it('discovers fact candidates from auto-registered tool results', async () => {
    const env = await createContactsEnv();
    const contact = env.getVariable('contact');
    if (!contact) {
      throw new Error('Expected @contact to be defined');
    }

    env.setScopedEnvironmentConfig({
      fyi: {
        autoFacts: true
      }
    });
    env.recordToolCall({
      name: 'search_contacts',
      timestamp: Date.now(),
      ok: true,
      result: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        id: 'contact-1'
      },
      fyiFactRoot: contact
    });

    const result = await evaluateFyiFacts(undefined, env);

    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada Lovelace',
        field: 'email',
        fact: 'fact:@contact.email'
      },
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada Lovelace',
        field: 'id',
        fact: 'fact:@contact.id'
      }
    ]);
  });
});
