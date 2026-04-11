import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { normalizePolicyConfig } from '@core/policy/union';
import { makeSecurityDescriptor } from '@core/types/security';
import { accessField } from '@interpreter/utils/field-access';
import {
  applySecurityDescriptorToStructuredValue,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { evaluateFyiKnown } from './facts-runtime';

const HANDLE_RE = /^h_[a-z0-9]{6}$/;

async function createContactsEnv(): Promise<Environment> {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  const source = `
/record @contact = {
  facts: [email: string, id: string],
  data: [name: string]
}
/exe exfil:send, tool:w @send_email(recipient, subject, body) = "sent" with {
  controlArgs: ["recipient"]
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

  const contactValue = contact.value;
  const email = await accessField(contactValue, { type: 'field', value: 'email' } as any, { env });
  const id = await accessField(contactValue, { type: 'field', value: 'id' } as any, { env });
  env.issueHandle(email, {
    preview: 'Ada Lovelace',
    metadata: { field: 'email' }
  });
  env.issueHandle(id, {
    preview: 'Ada Lovelace',
    metadata: { field: 'id' }
  });

  return env;
}

function createKnownStructuredText(value: string) {
  const structured = wrapStructured(value, 'text', value);
  applySecurityDescriptorToStructuredValue(
    structured,
    makeSecurityDescriptor({
      attestations: ['known']
    })
  );
  return structured;
}

describe('evaluateFyiKnown', () => {
  it('returns bounded handle-backed candidates without exposing raw values', async () => {
    const env = await createContactsEnv();

    const result = await evaluateFyiKnown(undefined, env);

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
  });

  it('filters send destinations to email facts by arg semantics', async () => {
    const env = await createContactsEnv();

    const result = await evaluateFyiKnown(
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
    const env = await createContactsEnv();

    const result = await evaluateFyiKnown('email.send', env);

    expect(result.type).toBe('object');
    expect(result.data).toEqual({
      bcc: [
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'Ada Lovelace',
          field: 'email',
          fact: 'fact:@contact.email'
        }
      ],
      cc: [
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'Ada Lovelace',
          field: 'email',
          fact: 'fact:@contact.email'
        }
      ],
      recipient: [
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'Ada Lovelace',
          field: 'email',
          fact: 'fact:@contact.email'
        }
      ],
      recipients: [
        {
          handle: expect.stringMatching(HANDLE_RE),
          label: 'Ada Lovelace',
          field: 'email',
          fact: 'fact:@contact.email'
        }
      ]
    });
  });

  it('supports bare-string op queries with a separate arg override', async () => {
    const env = await createContactsEnv();

    const result = await evaluateFyiKnown('email.send', env, 'recipient');

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
    const email = await accessField(contact.value, { type: 'field', value: 'email' } as any, { env });
    env.issueHandle(email, {
      preview: 'a***@example.com',
      metadata: { field: 'email' }
    });

    const result = await evaluateFyiKnown(
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

  it('prefers live operation metadata for declared sourceArgs', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    const source = `
/record @document = {
  facts: [id: string],
  data: [body: string]
}
/exe @emitDocument() = js {
  return { id: "doc-1", body: "Quarterly summary" };
} => document
/exe tool:r @extractSummary(source, query) = @source with {
  sourceArgs: ["source"]
}
/var @document = @emitDocument()
`;
    const { ast } = await parse(source);
    await evaluate(ast, env);

    const document = env.getVariable('document');
    if (!document) {
      throw new Error('Expected @document to be defined');
    }
    const id = await accessField(document.value, { type: 'field', value: 'id' } as any, { env });
    env.issueHandle(id, {
      preview: 'Document 1',
      metadata: { field: 'id' }
    });

    const result = await evaluateFyiKnown(
      { op: 'op:named:extractSummary', arg: 'source' },
      env
    );

    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Document 1',
        field: 'id',
        fact: 'fact:@document.id'
      }
    ]);
  });

  it('filters destructive targets to id facts', async () => {
    const env = await createContactsEnv();

    const result = await evaluateFyiKnown(
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

    const result = await evaluateFyiKnown(
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

    const result = await evaluateFyiKnown(
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

    const result = await evaluateFyiKnown(
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

  it('returns builder-minted known handles alongside fact-backed handles', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    const source = `
/record @contact = {
  facts: [email: string],
  data: [name: string]
}
/exe exfil:send, tool:w @send_email(recipient, subject, body) = "sent" with {
  controlArgs: ["recipient"]
}
/exe @emitContact() = js {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com"
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
    const email = await accessField(contact.value, { type: 'field', value: 'email' } as any, { env });
    env.issueHandle(email, {
      preview: 'Ada Lovelace',
      metadata: { field: 'email' }
    });

    env.issueHandle(createKnownStructuredText('john@example.com'), {
      preview: 'john@example.com',
      metadata: {
        proof: 'known',
        op: 'op:named:send_email',
        arg: 'recipient'
      }
    });

    const result = await evaluateFyiKnown(
      { op: 'send_email', arg: 'recipient' },
      env
    );

    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada Lovelace',
        field: 'email',
        fact: 'fact:@contact.email'
      },
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'john@example.com',
        proof: 'known'
      }
    ]);
  });

  it('does not surface trusted-data handles as fact-backed known candidates', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    const source = `
/record @contact = {
  facts: [id: string],
  data: {
    trusted: [email: string]
  }
}
/exe exfil:send, tool:w @send_email(recipient, subject, body) = "sent" with {
  controlArgs: ["recipient"]
}
/exe @emitContact() = js {
  return {
    id: "contact-1",
    email: "ada@example.com"
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

    const email = await accessField(contact.value, { type: 'field', value: 'email' } as any, { env });
    const id = await accessField(contact.value, { type: 'field', value: 'id' } as any, { env });
    env.issueHandle(email, {
      preview: 'Ada Lovelace',
      metadata: { field: 'email' }
    });
    env.issueHandle(id, {
      preview: 'Ada Lovelace',
      metadata: { field: 'id' }
    });

    const recipientCandidates = await evaluateFyiKnown(
      { op: 'op:named:email.send', arg: 'recipient' },
      env
    );
    expect(recipientCandidates.data).toEqual([]);

    const allCandidates = await evaluateFyiKnown(undefined, env);
    expect(allCandidates.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'Ada Lovelace',
        field: 'id',
        fact: 'fact:@contact.id'
      }
    ]);
  });

  it('discovers each separately registered element of an array fact field', async () => {
    const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
    const source = `
/record @calendar_evt = {
  facts: [participants: array],
  data: [title: string]
}
/exe @emitEvent() = js {
  return {
    participants: ["ada@example.com", "grace@example.com"],
    title: "Lunch"
  };
} => calendar_evt
/var @event = @emitEvent()
`;
    const { ast } = await parse(source);
    await evaluate(ast, env);

    const event = env.getVariable('event');
    if (!event) {
      throw new Error('Expected @event to be defined');
    }

    const participants = await accessField(event.value, { type: 'field', value: 'participants' } as any, { env });
    const first = await accessField(participants, { type: 'arrayIndex', value: 0 } as any, { env });
    const second = await accessField(participants, { type: 'arrayIndex', value: 1 } as any, { env });
    env.issueHandle(first, {
      preview: 'a***@example.com',
      metadata: { field: 'participants' }
    });
    env.issueHandle(second, {
      preview: 'g***@example.com',
      metadata: { field: 'participants' }
    });

    const result = await evaluateFyiKnown(undefined, env);

    expect(result.type).toBe('array');
    expect(result.data).toEqual([
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'a***@example.com',
        field: 'participants',
        fact: 'fact:@calendar_evt.participants'
      },
      {
        handle: expect.stringMatching(HANDLE_RE),
        label: 'g***@example.com',
        field: 'participants',
        fact: 'fact:@calendar_evt.participants'
      }
    ]);
  });
});
