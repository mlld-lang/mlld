import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { accessField } from '@interpreter/utils/field-access';
import { evaluateFyiKnown } from '@interpreter/fyi/facts-runtime';

const HANDLE_RE = /^h_[a-z0-9]{6}$/;

async function createEnvironment(source: string): Promise<Environment> {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  const { ast } = await parse(source);
  await evaluate(ast, env);
  return env;
}

describe('box fyi integration', () => {
  it('treats @fyi.known() and @fyi.known({}) identically once handles exist in the registry', async () => {
    const env = await createEnvironment(`
/record @contact = {
  facts: [email: string, name: string]
}
/exe @emitContact() = js {
  return { email: "mark@example.com", name: "Mark" };
} => contact
/var @contact = @emitContact()
`);

    const contact = env.getVariable('contact');
    if (!contact) {
      throw new Error('Expected @contact to be defined');
    }
    const email = await accessField(contact.value, { type: 'field', value: 'email' } as any, { env });
    const name = await accessField(contact.value, { type: 'field', value: 'name' } as any, { env });
    env.issueHandle(email, {
      preview: 'Mark',
      metadata: { field: 'email' }
    });
    env.issueHandle(name, {
      preview: 'Mark',
      metadata: { field: 'name' }
    });

    const noArg = await evaluateFyiKnown(undefined, env);
    const explicit = await evaluateFyiKnown({}, env);

    expect(noArg.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Mark',
        field: 'email',
        fact: 'fact:@contact.email'
      },
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Mark',
        field: 'name',
        fact: 'fact:@contact.name'
      }
    ]);
    expect(explicit.data).toEqual(noArg.data);
  });

  it('discovers registry-backed handles for explicit arg queries without any fyi root config', async () => {
    const env = await createEnvironment(`
/record @contact = {
  facts: [email: string],
  data: [name: string]
}
/exe @emitContact() = js {
  return { email: "ada@example.com", name: "Ada" };
} => contact
/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = "sent" with {
  controlArgs: ["recipient"]
}
/var @contact = @emitContact()
`);

    const contact = env.getVariable('contact');
    if (!contact) {
      throw new Error('Expected @contact to be defined');
    }
    const email = await accessField(contact.value, { type: 'field', value: 'email' } as any, { env });
    env.issueHandle(email, {
      preview: 'Ada',
      metadata: { field: 'email' }
    });

    const result = await evaluateFyiKnown(
      { op: 'op:named:email.send', arg: 'recipient' },
      env
    );

    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada',
        field: 'email',
        fact: 'fact:@contact.email'
      }
    ]);
  });

  it('supports bare-string op queries and groups candidates by arg for agent usage', async () => {
    const env = await createEnvironment(`
/record @contact = {
  facts: [email: string],
  data: [name: string]
}
/exe @emitContact() = js {
  return { email: "mark@example.com", name: "Mark Davies" };
} => contact
/exe exfil:send, tool:w @sendEmail(recipient, subject, body) = "sent" with {
  controlArgs: ["recipient"]
}
/var @contact = @emitContact()
`);

    const contact = env.getVariable('contact');
    if (!contact) {
      throw new Error('Expected @contact to be defined');
    }
    const email = await accessField(contact.value, { type: 'field', value: 'email' } as any, { env });
    env.issueHandle(email, {
      preview: 'Mark Davies',
      metadata: { field: 'email' }
    });

    const result = await evaluateFyiKnown('sendEmail', env);

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
});
