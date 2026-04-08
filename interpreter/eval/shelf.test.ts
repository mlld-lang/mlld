import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { accessField } from '@interpreter/utils/field-access';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { extractShelfSlotRef, normalizeScopedShelfConfig } from '@interpreter/shelf/runtime';
import { interpret } from '@interpreter/index';

async function createEnvironment(source: string, filePath = '/main.mld'): Promise<Environment> {
  const fs = new MemoryFileSystem();
  await fs.writeFile(filePath, source);
  const env = new Environment(fs, new PathService(), '/');
  env.setCurrentFilePath(filePath);
  const { ast } = await parse(source, { mode: 'markdown' });
  await evaluate(ast, env);
  return env;
}

describe('shelf runtime', () => {
  it('preserves factsources through shelf write and read round-trips for scalar fact fields', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [email: string, id: string],
  data: [name: string]
}
/shelf @s = {
  things: contact[]
}
/exe @fetch() = js {
  return [{ email: "alice@example.com", id: "c1", name: "Alice" }];
} => contact
/var @found = @fetch()
/var @written = @shelf.write(@s.things, @found.0)
/var @readBack = @shelf.read(@s.things)
`);

    const found = env.getVariable('found')?.value;
    const readBack = env.getVariable('readBack')?.value;
    if (!found || !readBack) {
      throw new Error('Expected @found and @readBack to be defined');
    }

    const beforeRecord = await accessField(found, { type: 'arrayIndex', value: 0 } as any, { env });
    const afterRecord = await accessField(readBack, { type: 'arrayIndex', value: 0 } as any, { env });
    const beforeEmail = await accessField(beforeRecord, { type: 'field', value: 'email' } as any, { env });
    const afterEmail = await accessField(afterRecord, { type: 'field', value: 'email' } as any, { env });

    expect((beforeEmail as any).mx?.labels).toEqual(['fact:@contact.email']);
    expect((afterEmail as any).mx?.labels).toEqual((beforeEmail as any).mx?.labels);
    expect((beforeEmail as any).mx?.factsources).toEqual([
      expect.objectContaining({
        sourceRef: '@contact',
        field: 'email',
        instanceKey: 'c1'
      })
    ]);
    expect((afterEmail as any).mx?.factsources).toEqual((beforeEmail as any).mx?.factsources);
    expect(((afterRecord as any).mx?.labels ?? []).some((label: string) => label.startsWith('fact:'))).toBe(false);
  });

  it('writes and upserts keyed collection slots through @shelve', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string],
  data: [score: number?]
}
/shelf @outreach = {
  recipients: contact[]
}
/exe @emitContact(score) = js {
  return {
    id: "c_1",
    email: "mark@example.com",
    name: "Mark",
    score
  };
} => contact
/var @first = @emitContact(85)
/var @second = @emitContact(92)
@shelve(@outreach.recipients, @first)
@shelve(@outreach.recipients, @second)
`);

    expect(env.getShelfDefinition('outreach')?.slots.recipients.merge).toBe('upsert');

    const outreach = env.getVariable('outreach');
    if (!outreach) {
      throw new Error('Expected @outreach to be defined');
    }

    const recipients = await accessField(outreach, { type: 'field', value: 'recipients' } as any, { env });
    expect(extractShelfSlotRef(recipients)).toEqual({
      shelfName: 'outreach',
      slotName: 'recipients'
    });
    expect(Array.isArray(asData(recipients))).toBe(true);
    expect(asData<any[]>(recipients)).toHaveLength(1);

    const firstRecipient = await accessField(recipients, { type: 'arrayIndex', value: 0 } as any, { env });
    const score = await accessField(firstRecipient, { type: 'field', value: 'score' } as any, { env });

    expect(asData(score)).toBe(92);
    expect((firstRecipient as any).mx?.taint ?? []).toEqual(
      expect.arrayContaining(['src:shelf:@outreach.recipients'])
    );
  });

  it('supports append and replace merge semantics alongside keyed upsert', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string],
  data: [score: number?]
}
/shelf @pipeline = {
  recipients: contact[],
  audit_log: { type: contact[], merge: "append" },
  selected: contact?
}
/exe @emitContact(id, name, score) = js {
  return {
    id,
    email: id + "@example.com",
    name,
    score
  };
} => contact
/var @first = @emitContact("c_1", "Mark", 85)
/var @second = @emitContact("c_1", "Mark", 92)
@shelve(@pipeline.recipients, @first)
@shelve(@pipeline.recipients, @second)
@shelve(@pipeline.audit_log, @first)
@shelve(@pipeline.audit_log, @second)
@shelve(@pipeline.selected, @first)
@shelve(@pipeline.selected, @second)
`);

    const pipeline = env.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }

    const recipients = await accessField(pipeline, { type: 'field', value: 'recipients' } as any, { env });
    const auditLog = await accessField(pipeline, { type: 'field', value: 'audit_log' } as any, { env });
    const selected = await accessField(pipeline, { type: 'field', value: 'selected' } as any, { env });

    expect(asData<any[]>(recipients)).toHaveLength(1);
    expect(asData<any[]>(auditLog)).toHaveLength(2);

    const currentRecipient = await accessField(recipients, { type: 'arrayIndex', value: 0 } as any, { env });
    const currentScore = await accessField(currentRecipient, { type: 'field', value: 'score' } as any, { env });
    expect(asData(currentScore)).toBe(92);

    const firstAuditEntry = await accessField(auditLog, { type: 'arrayIndex', value: 0 } as any, { env });
    const secondAuditEntry = await accessField(auditLog, { type: 'arrayIndex', value: 1 } as any, { env });
    const firstAuditScore = await accessField(firstAuditEntry, { type: 'field', value: 'score' } as any, { env });
    const secondAuditScore = await accessField(secondAuditEntry, { type: 'field', value: 'score' } as any, { env });
    expect(asData(firstAuditScore)).toBe(85);
    expect(asData(secondAuditScore)).toBe(92);

    const selectedId = await accessField(selected, { type: 'field', value: 'id' } as any, { env });
    const selectedScore = await accessField(selected, { type: 'field', value: 'score' } as any, { env });
    expect(asData(selectedId)).toBe('c_1');
    expect(asData(selectedScore)).toBe(92);
  });

  it('keeps plain object record writes into singular shelf slots canonicalized', async () => {
    const env = await createEnvironment(`
/record @last_write_entry = {
  data: [
    tool: string,
    subtask_index: number?,
    target_key: string?,
    input_keys: array?,
    blocked_if_missing: array?,
    resolved_controls: array?,
    known_controls: array?
  ]
}
/shelf @s = {
  last_write: last_write_entry?
}
/var @value = {
  tool: "send_direct_message",
  subtask_index: 2,
  target_key: "all_users",
  input_keys: ["rankings"],
  blocked_if_missing: [],
  resolved_controls: [{ arg: "recipient", value: "Alice" }],
  known_controls: []
}
/var @written = @shelf.write(@s.last_write, @value)
`);

    const written = env.getVariable('written')?.value;
    const tool = await accessField(written, { type: 'field', value: 'tool' } as any, { env });
    const subtaskIndex = await accessField(written, { type: 'field', value: 'subtask_index' } as any, { env });
    const targetKey = await accessField(written, { type: 'field', value: 'target_key' } as any, { env });
    const inputKeys = await accessField(written, { type: 'field', value: 'input_keys' } as any, { env });
    const firstInputKey = await accessField(inputKeys, { type: 'arrayIndex', value: 0 } as any, { env });
    const resolvedControls = await accessField(written, { type: 'field', value: 'resolved_controls' } as any, { env });
    const firstResolved = await accessField(resolvedControls, { type: 'arrayIndex', value: 0 } as any, { env });
    const resolvedArg = await accessField(firstResolved, { type: 'field', value: 'arg' } as any, { env });
    const resolvedValue = await accessField(firstResolved, { type: 'field', value: 'value' } as any, { env });

    expect(asData(tool)).toBe('send_direct_message');
    expect(asData(subtaskIndex)).toBe(2);
    expect(asData(targetKey)).toBe('all_users');
    expect(asData(firstInputKey)).toBe('rankings');
    expect(asData(resolvedArg)).toBe('recipient');
    expect(asData(resolvedValue)).toBe('Alice');
  });

  it('supports object-typed shelf record fields with nested handle-bearing objects', async () => {
    const env = await createEnvironment(`
/record @capability_state_blob = {
  data: [value: object],
  display: {
    default: [value],
    worker: [value],
    planner: [value]
  }
}
/exe @coerceCapabilityStateBlob(rawValue) = [
  => {
    value: {
      raw: @rawValue
    }
  }
] => capability_state_blob
/shelf @state = {
  trusted: capability_state_blob?
}
`);

    const issuedEmail17 = env.issueHandle('17');
    const issuedEmail16 = env.issueHandle('16');
    const issuedSenderEmma = env.issueHandle('emma.johnson@bluesparrowtech.com');
    const issuedSenderJames = env.issueHandle('james.miller@yahoo.com');

    const source = `
/var @trustedValue = {
  reunion_emails: [
    {
      email_id: { value: "17", handle: "${issuedEmail17.handle}" },
      sender: { value: "emma.johnson@bluesparrowtech.com", handle: "${issuedSenderEmma.handle}" },
      date: "2026-04-03 16:00"
    },
    {
      email_id: { value: "16", handle: "${issuedEmail16.handle}" },
      sender: { value: "james.miller@yahoo.com", handle: "${issuedSenderJames.handle}" },
      date: "2026-04-03 15:00"
    }
  ]
}
@shelf.write(@state.trusted, @coerceCapabilityStateBlob(@trustedValue))
`;

    const { ast } = await parse(source, { mode: 'markdown' });
    await evaluate(ast, env);

    const stored = env.readShelfSlot('state', 'trusted');
    expect(isStructuredValue(stored)).toBe(true);

    const storedData = asData<Record<string, any>>(stored);
    const valueData = asData<Record<string, any>>(storedData.value);
    const reunionEmails = valueData.raw.reunion_emails;

    expect(reunionEmails).toHaveLength(2);
    expect(reunionEmails[0].email_id.handle).toBe(issuedEmail17.handle);
    expect(reunionEmails[0].sender.handle).toBe(issuedSenderEmma.handle);
    expect(reunionEmails[1].date).toBe('2026-04-03 15:00');
  });

  it('projects readable slot contents through @fyi.shelf and keeps @shelf/@shelve gated to writable scopes', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string],
  display: [name, { ref: "email" }]
}
/shelf @outreach = {
  recipients: contact[],
  selected: contact? from recipients
}
/exe @emitContact() = js {
  return {
    id: "c_1",
    email: "mark@example.com",
    name: "Mark"
  };
} => contact
/var @recipient = @emitContact()
@shelve(@outreach.recipients, @recipient)
`);

    const outreach = env.getVariable('outreach');
    if (!outreach) {
      throw new Error('Expected @outreach to be defined');
    }
    const recipientsRef = await accessField(outreach, { type: 'field', value: 'recipients' } as any, { env });
    const selectedRef = await accessField(outreach, { type: 'field', value: 'selected' } as any, { env });

    const readOnlyEnv = env.createChild();
    readOnlyEnv.setScopedEnvironmentConfig({
      shelf: await normalizeScopedShelfConfig({ read: [recipientsRef] }, env)
    });

    expect(readOnlyEnv.hasVariable('shelf')).toBe(false);
    expect(readOnlyEnv.hasVariable('shelve')).toBe(false);

    const fyi = readOnlyEnv.getVariable('fyi');
    if (!fyi) {
      throw new Error('Expected @fyi to be defined');
    }
    const shelfView = await accessField(fyi, { type: 'field', value: 'shelf' } as any, { env: readOnlyEnv });
    const outreachView = await accessField(shelfView, { type: 'field', value: 'outreach' } as any, { env: readOnlyEnv });
    const projectedRecipients = await accessField(outreachView, { type: 'field', value: 'recipients' } as any, { env: readOnlyEnv });

    expect(extractShelfSlotRef(projectedRecipients)).toEqual({
      shelfName: 'outreach',
      slotName: 'recipients'
    });
    expect(asData(projectedRecipients)).toEqual([
      {
        name: 'Mark',
        email: {
          value: 'mark@example.com',
          handle: expect.stringMatching(/^h_[a-z0-9]{6}$/)
        }
      }
    ]);

    const writableEnv = env.createChild();
    writableEnv.setScopedEnvironmentConfig({
      shelf: await normalizeScopedShelfConfig({ read: [recipientsRef], write: [selectedRef] }, env)
    });

    expect(writableEnv.hasVariable('shelf')).toBe(true);
    expect(writableEnv.hasVariable('shelve')).toBe(true);
  });

  it('supports aliased slot refs in box shelf config for reads, writes, and @shelf.read', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @ledger = {
  execution_log: contact[],
  candidates: contact[],
  selected: contact? from execution_log
}
/exe @emitContact(id, name) = js {
  return {
    id,
    email: id + "@example.com",
    name
  };
} => contact
/var @logSlot = @ledger.execution_log
/var @candidateSlot = @ledger.candidates
/var @selectedSlot = @ledger.selected
@shelf.write(@candidateSlot, @emitContact("c_1", "Mark"))
/box {
  shelf: {
    read: [@candidateSlot as candidates],
    write: [@logSlot as execution_log, @selectedSlot as selected]
  }
} [
  let @candidateState = @shelf.read(@fyi.shelf.candidates)
  @shelf.write(@fyi.shelf.execution_log, @candidateState[0])
  let @currentLog = @shelf.read(@fyi.shelf.execution_log)
  @shelf.write(@fyi.shelf.selected, @currentLog[0])
]
`);

    const executionLog = env.readShelfSlot('ledger', 'execution_log') as unknown[];
    expect(executionLog).toHaveLength(1);
    const firstEntry = executionLog[0];
    const firstId = await accessField(firstEntry, { type: 'field', value: 'id' } as any, { env });
    expect(asData(firstId)).toBe('c_1');

    const selected = env.readShelfSlot('ledger', 'selected');
    const selectedId = await accessField(selected, { type: 'field', value: 'id' } as any, { env });
    expect(asData(selectedId)).toBe('c_1');
  });

  it('exposes declared slot names and slot refs through shelf.mx introspection', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @planner = {
  trusted_email: contact?,
  trusted_calendar: contact?,
  selected: contact?
}
`);

    const planner = env.getVariable('planner');
    if (!planner) {
      throw new Error('Expected @planner to be defined');
    }

    const mx = await accessField(planner, { type: 'field', value: 'mx' } as any, { env });
    const slots = await accessField(mx, { type: 'field', value: 'slots' } as any, { env });
    const slotEntries = await accessField(mx, { type: 'field', value: 'slotEntries' } as any, { env });

    expect(slots).toEqual(['trusted_email', 'trusted_calendar', 'selected']);
    expect(Array.isArray(slotEntries)).toBe(true);
    expect(slotEntries).toHaveLength(3);

    const firstEntry = await accessField(slotEntries, { type: 'arrayIndex', value: 0 } as any, { env });
    const firstName = await accessField(firstEntry, { type: 'field', value: 'name' } as any, { env });
    const firstRef = await accessField(firstEntry, { type: 'field', value: 'ref' } as any, { env });

    expect(firstName).toBe('trusted_email');
    expect(extractShelfSlotRef(firstRef)).toEqual({
      shelfName: 'planner',
      slotName: 'trusted_email'
    });
  });

  it('lets executable params named shelf shadow the builtin @shelf helper', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @planner = {
  trusted_email: contact?,
  trusted_calendar: contact?,
  selected: contact?
}
/exe @probe(shelf) = [
  => {
    slots: @shelf.mx.slots,
    slotEntries: @shelf.mx.slotEntries,
    trusted: @shelf.trusted_email
  }
]
/var @result = @probe(@planner)
`);

    const result = env.getVariable('result')?.value;
    if (!result) {
      throw new Error('Expected @result to be defined');
    }

    const slots = await accessField(result, { type: 'field', value: 'slots' } as any, { env });
    const slotEntries = await accessField(result, { type: 'field', value: 'slotEntries' } as any, { env });
    const trustedRef = await accessField(result, { type: 'field', value: 'trusted' } as any, { env });

    expect(slots).toEqual(['trusted_email', 'trusted_calendar', 'selected']);
    expect(Array.isArray(slotEntries)).toBe(true);

    const firstEntry = await accessField(slotEntries, { type: 'arrayIndex', value: 0 } as any, { env });
    const firstName = await accessField(firstEntry, { type: 'field', value: 'name' } as any, { env });
    const firstRef = await accessField(firstEntry, { type: 'field', value: 'ref' } as any, { env });

    expect(asData(firstName)).toBe('trusted_email');
    expect(extractShelfSlotRef(firstRef)).toEqual({
      shelfName: 'planner',
      slotName: 'trusted_email'
    });
    expect(extractShelfSlotRef(trustedRef)).toEqual({
      shelfName: 'planner',
      slotName: 'trusted_email'
    });
  });

  it('preserves shelf introspection through object fields, rebinding, and exe params', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @planner = {
  trusted_email: contact?,
  trusted_calendar: contact?,
  selected: contact?
}
/var @agent = { shelf: @planner }
/var @fieldSlots = @agent.shelf.mx.slots
/var @fieldEntries = @agent.shelf.mx.slotEntries
/var @fromField = @agent.shelf
/var @reboundSlots = @fromField.mx.slots
/exe @probe(scope) = [
  => @scope.mx.slots
]
/var @paramSlots = @probe(@agent.shelf)
`);

    expect(env.getVariable('fieldSlots')?.value).toEqual([
      'trusted_email',
      'trusted_calendar',
      'selected'
    ]);
    expect(env.getVariable('reboundSlots')?.value).toEqual([
      'trusted_email',
      'trusted_calendar',
      'selected'
    ]);
    expect(env.getVariable('fromField')?.internal?.isShelf).toBe(true);
    expect(asData(env.getVariable('paramSlots')?.value)).toEqual([
      'trusted_email',
      'trusted_calendar',
      'selected'
    ]);

    const fieldEntries = env.getVariable('fieldEntries')?.value;
    if (!fieldEntries) {
      throw new Error('Expected @fieldEntries to be defined');
    }

    const firstEntry = await accessField(fieldEntries, { type: 'arrayIndex', value: 0 } as any, { env });
    const firstName = await accessField(firstEntry, { type: 'field', value: 'name' } as any, { env });
    const firstRef = await accessField(firstEntry, { type: 'field', value: 'ref' } as any, { env });

    expect(firstName).toBe('trusted_email');
    expect(extractShelfSlotRef(firstRef)).toEqual({
      shelfName: 'planner',
      slotName: 'trusted_email'
    });
  });

  it('preserves inline object args through imported namespace executable calls', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();

    await fileSystem.writeFile('/provider.mld', `
/exe @build(config) = [
  => {
    suite: @config.suite,
    shelfSlots: @config.shelf.mx.slots,
    shelfType: @typeof(@config.shelf),
    configType: @typeof(@config)
  }
]
/export { @build }
`);

    const output = await interpret(`
/import "./provider.mld" as @rig
/record @contact = {
  key: id,
  facts: [id: string]
}
/shelf @planner = {
  trusted_email: contact?,
  trusted_calendar: contact?,
  selected: contact?
}
/var @cfg = { suite: "bound", shelf: @planner }
/var @bound = @rig.build(@cfg)
/var @inline = @rig.build({ suite: "inline", shelf: @planner })
/show @bound
/show @inline
`, {
      fileSystem,
      pathService,
      basePath: '/',
      format: 'markdown'
    });

    expect(output).toContain('bound');
    expect(output).toContain('inline');
    expect(output).toContain('trusted_email');
  });

  it('preserves inline object args when an imported executable forwards config to another imported executable', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();

    await fileSystem.writeFile('/validator.mld', `
/exe @validateConfig(config) = [
  if !@config.suite.isDefined() [
    => { error: "missing_suite" }
  ]
  => { ok: true }
]
/export { @validateConfig }
`);

    await fileSystem.writeFile('/provider.mld', `
/import { @validateConfig } from "./validator.mld"
/exe @build(config) = [
  let @configType = @typeof(@config)
  let @suiteType = @typeof(@config.suite)
  let @before = @typeof(@config.shelf.mx.slots)
  let @validation = @validateConfig(@config)
  let @after = @typeof(@config.shelf.mx.slots)
  if @validation.error.isDefined() [ => @validation ]
  => {
    configType: @configType,
    suiteType: @suiteType,
    before: @before,
    after: @after,
    suite: @config.suite,
    shelf: @config.shelf
  }
]
/var @rig = { build: @build }
/export { @rig }
`);

    const output = await interpret(`
/import { @rig } from "./provider.mld"
/record @contact = {
  key: id,
  facts: [id: string]
}
/shelf @planner = {
  trusted_email: contact?,
  trusted_calendar: contact?,
  selected: contact?
}
/var @cfg = { suite: "bound", shelf: @planner }
/var @bound = @rig.build(@cfg)
/show @bound.configType
/show @bound.suiteType
/show @bound.before
/show @bound.after
/show @typeof(@bound.shelf.mx.slots)
/var @inline = @rig.build({ suite: "inline", shelf: @planner })
/show @inline.configType
/show @inline.suiteType
/show @inline.before
/show @inline.after
/show @typeof(@inline.shelf.mx.slots)
`, {
      fileSystem,
      pathService,
      basePath: '/',
      format: 'markdown'
    });

    const lines = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    expect(lines).toEqual([
      'object',
      'string',
      'array',
      'array',
      'array',
      'object',
      'string',
      'array',
      'array',
      'array'
    ]);
  });

  it('normalizes runtime shelf scope values from alias objects and object maps', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @planner = {
  trusted_email: contact?,
  trusted_calendar: contact?,
  selected: contact?
}
`);

    const planner = env.getVariable('planner');
    if (!planner) {
      throw new Error('Expected @planner to be defined');
    }

    const trustedEmailRef = await accessField(planner, { type: 'field', value: 'trusted_email' } as any, { env });
    const trustedCalendarRef = await accessField(planner, { type: 'field', value: 'trusted_calendar' } as any, { env });
    const selectedRef = await accessField(planner, { type: 'field', value: 'selected' } as any, { env });

    const scope = await normalizeScopedShelfConfig(
      {
        read: [
          { trusted_email: trustedEmailRef },
          { trusted_calendar: trustedCalendarRef }
        ],
        write: {
          selected: selectedRef
        }
      },
      env
    );

    expect(scope.readSlotBindings).toEqual([
      {
        ref: { shelfName: 'planner', slotName: 'trusted_email' },
        alias: 'trusted_email'
      },
      {
        ref: { shelfName: 'planner', slotName: 'trusted_calendar' },
        alias: 'trusted_calendar'
      },
      {
        ref: { shelfName: 'planner', slotName: 'selected' },
        alias: 'selected'
      }
    ]);
    expect(scope.writeSlotBindings).toEqual([
      {
        ref: { shelfName: 'planner', slotName: 'selected' },
        alias: 'selected'
      }
    ]);
  });

  it('accepts computed shelf scope values in box config', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @planner = {
  trusted_email: contact?,
  trusted_calendar: contact?,
  selected: contact?
}
/exe @emitContact(id, name) = js {
  return {
    id,
    email: id + "@example.com",
    name
  };
} => contact
@shelf.write(@planner.trusted_email, @emitContact("email_1", "Email"))
@shelf.write(@planner.trusted_calendar, @emitContact("calendar_1", "Calendar"))
/var @scope = {
  read: @planner.mx.slotEntries,
  write: {
    selected: @planner.selected
  }
}
/box {
  shelf: @scope
} [
  let @candidate = @shelf.read(@fyi.shelf.trusted_calendar)
  @shelf.write(@fyi.shelf.selected, @candidate)
]
/var @selected = @shelf.read(@planner.selected)
`);

    const selected = env.getVariable('selected')?.value;
    const selectedId = await accessField(selected, { type: 'field', value: 'id' } as any, { env });

    expect(asData(selectedId)).toBe('calendar_1');
  });

  it('preserves box return values through shelf-scoped boxes inside exe blocks', async () => {
    const env = await createEnvironment(`
/record @note = {
  facts: [text: string]
}
/shelf @state = {
  log: note[]
}
/exe @test() = [
  let @result = box {
    shelf: {
      read: [@state.log]
    }
  } [
    => "hello from inside the box"
  ]
  => @result
]
/var @final = @test()
`);

    const final = env.getVariable('final')?.value;
    expect(asData(final)).toBe('hello from inside the box');
  });

  it('preserves structured box return values through shelf-scoped exe and loop chains', async () => {
    const env = await createEnvironment(`
/record @note = {
  facts: [text: string]
}
/shelf @s = {
  log: note[]
}
/exe @planStep() = [
  let @result = box {
    shelf: {
      read: [@s.log]
    }
  } [
    => { action: "compose_answer", reasoning: "done" }
  ]
  => @result
]
/var @loopResult = loop(3) [
  let @state = @input ?? { iterations: 0, answer: null }
  let @decision = @planStep()

  when @decision.action [
    "compose_answer" => done {
      iterations: @state.iterations + 1,
      answer: "finished"
    }
    * => continue {
      iterations: @state.iterations + 1,
      answer: null
    }
  ]
]
`);

    const loopResult = env.getVariable('loopResult')?.value;
    expect(isStructuredValue(loopResult) ? asData(loopResult) : loopResult).toEqual({
      iterations: 1,
      answer: 'finished'
    });
  });

  it('keeps the same exe and loop return chain working without shelf-scoped box config', async () => {
    const env = await createEnvironment(`
/exe @planStep() = [
  let @result = box [
    => { action: "compose_answer", reasoning: "done" }
  ]
  => @result
]
/var @loopResult = loop(3) [
  let @state = @input ?? { iterations: 0, answer: null }
  let @decision = @planStep()

  when @decision.action [
    "compose_answer" => done {
      iterations: @state.iterations + 1,
      answer: "finished"
    }
    * => continue {
      iterations: @state.iterations + 1,
      answer: null
    }
  ]
]
`);

    const loopResult = env.getVariable('loopResult')?.value;
    expect(isStructuredValue(loopResult) ? asData(loopResult) : loopResult).toEqual({
      iterations: 1,
      answer: 'finished'
    });
  });

  it('preserves shelf surface slot refs through local binding and wrapper params', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  execution_log: contact[]
}
/exe @emitContact(id, name) = js {
  return {
    id,
    email: id + "@example.com",
    name
  };
} => contact
/exe @appendViaShelfSurface(stateShelf, value) = [
  let @slot = @stateShelf.execution_log
  @shelf.write(@slot, @value)
]
/exe @readViaShelfSurface(stateShelf) = [
  let @slot = @stateShelf.execution_log
  => @shelf.read(@slot)
]
/var @surfaceState = box {
  shelf: {
    read: [@pipeline.execution_log as execution_log],
    write: [@pipeline.execution_log as execution_log]
  }
} [
  let @workspace_state = @fyi.shelf
  @appendViaShelfSurface(@workspace_state, @emitContact("c_1", "Mark"))
  @appendViaShelfSurface(@workspace_state, @emitContact("c_2", "Ava"))
  => @readViaShelfSurface(@workspace_state)
]
`);

    const surfaceState = env.getVariable('surfaceState')?.value;
    expect(asData<any[]>(surfaceState)).toHaveLength(2);

    const firstEntry = await accessField(surfaceState, { type: 'arrayIndex', value: 0 } as any, { env });
    const secondEntry = await accessField(surfaceState, { type: 'arrayIndex', value: 1 } as any, { env });
    const firstId = await accessField(firstEntry, { type: 'field', value: 'id' } as any, { env });
    const secondId = await accessField(secondEntry, { type: 'field', value: 'id' } as any, { env });
    expect(asData(firstId)).toBe('c_1');
    expect(asData(secondId)).toBe('c_2');
  });

  it('supports direct indexed reads from aliased @fyi.shelf entries', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @ledger = {
  candidates: contact[]
}
/exe @emitContact(id, name) = js {
  return {
    id,
    email: id + "@example.com",
    name
  };
} => contact
/var @candidateSlot = @ledger.candidates
@shelve(@candidateSlot, @emitContact("c_1", "Mark"))
/var @firstCandidateId = box {
  shelf: {
    read: [@candidateSlot as candidates]
  }
} [
  => @fyi.shelf.candidates[0].id
]
`);

    const firstCandidateId = env.getVariable('firstCandidateId')?.value;
    expect(isStructuredValue(firstCandidateId) ? asData(firstCandidateId) : firstCandidateId).toBe('c_1');
  });

  it('rejects conflicting slot aliases in box shelf config', async () => {
    await expect(createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @ledger = {
  execution_log: contact[],
  candidates: contact[]
}
/var @firstSlot = @ledger.execution_log
/var @secondSlot = @ledger.candidates
/box {
  shelf: {
    read: [@firstSlot as slot, @secondSlot as slot]
  }
} [
  show "noop"
]
`)).rejects.toThrow(/Shelf alias 'slot' is already bound to a different slot/);
  });

  it('imports exported shelf declarations with multiple slots and dependent records', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/state.mld', `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/record @email_draft = {
  facts: [recipient: string],
  data: [subject: string, body: string]
}
/shelf @pipeline = {
  recipients: contact[],
  selected: contact? from recipients,
  drafts: email_draft[]
}
/export { @pipeline }
`);
    await fs.writeFile('/app.mld', `
/import { @pipeline } from "/state.mld"
/exe @emitContact() = js {
  return {
    id: "c_1",
    email: "mark@example.com",
    name: "Mark"
  };
} => contact
/exe @emitDraft() = js {
  return {
    recipient: "mark@example.com",
    subject: "Follow up",
    body: "Hello there"
  };
} => email_draft
/var @recipient = @emitContact()
@shelve(@pipeline.recipients, @recipient)
@shelve(@pipeline.selected, @recipient)
@shelve(@pipeline.drafts, @emitDraft())
`);

    const { ast } = await parse(await fs.readFile('/app.mld'), { mode: 'markdown' });
    const freshEnv = new Environment(fs, new PathService(), '/');
    freshEnv.setCurrentFilePath('/app.mld');
    await evaluate(ast, freshEnv);

    expect(freshEnv.getRecordDefinition('contact')).toBeDefined();
    expect(freshEnv.getRecordDefinition('email_draft')).toBeDefined();
    expect(freshEnv.getShelfDefinition('pipeline')).toBeDefined();

    const pipeline = freshEnv.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }
    const recipients = await accessField(pipeline, { type: 'field', value: 'recipients' } as any, { env: freshEnv });
    const selected = await accessField(pipeline, { type: 'field', value: 'selected' } as any, { env: freshEnv });
    const drafts = await accessField(pipeline, { type: 'field', value: 'drafts' } as any, { env: freshEnv });
    expect(asData<any[]>(recipients)).toHaveLength(1);

    const selectedName = await accessField(selected, { type: 'field', value: 'name' } as any, { env: freshEnv });
    expect(asData(selectedName)).toBe('Mark');

    expect(asData<any[]>(drafts)).toHaveLength(1);
    const firstDraft = await accessField(drafts, { type: 'arrayIndex', value: 0 } as any, { env: freshEnv });
    const subject = await accessField(firstDraft, { type: 'field', value: 'subject' } as any, { env: freshEnv });
    expect(asData(subject)).toBe('Follow up');
  });

  it('imports exported record definitions across module boundaries before dependent shelf evaluation', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/provider.mld', `
/record @thing = {
  data: [name: string]
}
/export { @thing }
`);
    await fs.writeFile('/consumer.mld', `
/import { @thing } from "/provider.mld"
/shelf @state = {
  selected: thing?
}
/export { @state }
`);
    await fs.writeFile('/top.mld', `
/import { @state } from "/consumer.mld"
/var @ok = "ok"
`);

    const { ast } = await parse(await fs.readFile('/top.mld'), { mode: 'markdown' });
    const env = new Environment(fs, new PathService(), '/');
    env.setCurrentFilePath('/top.mld');
    await evaluate(ast, env);

    expect(env.getRecordDefinition('thing')).toBeDefined();
    expect(env.getShelfDefinition('state')?.slots.selected.record).toBe('thing');
  });

  it('preserves slot references through wrapper executables that call @shelf methods', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/exe @emitContact() = js {
  return {
    id: "c_1",
    email: "mark@example.com",
    name: "Mark"
  };
} => contact
/exe @appendViaParam(slot, value) = [
  @shelf.write(@slot, @value)
]
/exe @removeViaParam(slot, value) = [
  @shelf.remove(@slot, @value)
]
/exe @clearViaParam(slot) = [
  @shelf.clear(@slot)
]
/var @recipient = @emitContact()
@appendViaParam(@pipeline.recipients, @recipient)
@removeViaParam(@pipeline.recipients, @recipient)
@appendViaParam(@pipeline.recipients, @recipient)
@clearViaParam(@pipeline.recipients)
`);

    const pipeline = env.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }

    const recipients = await accessField(pipeline, { type: 'field', value: 'recipients' } as any, { env });
    expect(extractShelfSlotRef(recipients)).toEqual({
      shelfName: 'pipeline',
      slotName: 'recipients'
    });
    expect(asData<any[]>(recipients)).toEqual([]);
  });

  it('reads current slot contents back through @shelf.read using slot-ref params', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/exe @emitContact(id, name) = js {
  return {
    id,
    email: id + "@example.com",
    name
  };
} => contact
/exe @appendViaParam(slot, value) = [
  @shelf.write(@slot, @value)
]
/exe @readViaParam(slot) = @shelf.read(@slot)
@appendViaParam(@pipeline.recipients, @emitContact("c_1", "Mark"))
/var @firstState = @readViaParam(@pipeline.recipients)
@appendViaParam(@pipeline.recipients, @emitContact("c_2", "Ava"))
/var @secondState = @readViaParam(@pipeline.recipients)
/var @directState = @shelf.read(@pipeline.recipients)
`);

    expect(asData<any[]>(env.getVariable('firstState')?.value)).toHaveLength(1);
    expect(asData<any[]>(env.getVariable('secondState')?.value)).toHaveLength(2);

    const directState = env.getVariable('directState')?.value;
    expect(asData<any[]>(directState)).toHaveLength(2);

    const firstEntry = await accessField(directState, { type: 'arrayIndex', value: 0 } as any, { env });
    const secondEntry = await accessField(directState, { type: 'arrayIndex', value: 1 } as any, { env });
    const firstId = await accessField(firstEntry, { type: 'field', value: 'id' } as any, { env });
    const secondId = await accessField(secondEntry, { type: 'field', value: 'id' } as any, { env });

    expect(asData(firstId)).toBe('c_1');
    expect(asData(secondId)).toBe('c_2');
  });

  it('emits shelf.remove events with removal details', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/exe @emitContact(id, name) = {
  id: @id,
  email: \`@id@example.com\`,
  name: @name
} => contact
@shelve(@pipeline.recipients, @emitContact("c_1", "Ada"))
@shelve(@pipeline.recipients, @emitContact("c_2", "Bob"))
@shelf.remove(@pipeline.recipients, "c_1")
/show "done"
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    expect(result.traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'shelf',
          event: 'shelf.remove',
          data: expect.objectContaining({
            slot: '@pipeline.recipients',
            removedCount: 1
          })
        })
      ])
    );
  });

  it('emits shelf.stale_read diagnostics when a same-context read diverges from the last write', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  selected: contact?
}
    `);

    env.setRuntimeTrace('effects');
    env.writeShelfSlot('pipeline', 'selected', { id: 'c_1', email: 'ada@example.com', name: 'Ada' });
    (env as any).shelfState.get('pipeline').set('selected', {
      id: 'c_2',
      email: 'stale@example.com',
      name: 'Stale'
    });
    env.readShelfSlot('pipeline', 'selected');

    expect(env.getRuntimeTraceEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'shelf',
          event: 'shelf.stale_read',
          data: expect.objectContaining({
            slot: '@pipeline.selected'
          })
        })
      ])
    );
  });

  it('keeps @shelve.read/@shelve.clear/@shelve.remove as compatibility aliases', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/exe @emitContact(id, name) = js {
  return {
    id,
    email: id + "@example.com",
    name
  };
} => contact
@shelve(@pipeline.recipients, @emitContact("c_1", "Mark"))
@shelve(@pipeline.recipients, @emitContact("c_2", "Ava"))
@shelve.remove(@pipeline.recipients, @emitContact("c_1", "Mark"))
/var @remaining = @shelve.read(@pipeline.recipients)
@shelve.clear(@pipeline.recipients)
`);

    const remaining = env.getVariable('remaining')?.value;
    expect(asData<any[]>(remaining)).toHaveLength(1);

    const onlyEntry = await accessField(remaining, { type: 'arrayIndex', value: 0 } as any, { env });
    const onlyId = await accessField(onlyEntry, { type: 'field', value: 'id' } as any, { env });
    expect(asData(onlyId)).toBe('c_2');

    const pipeline = env.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }
    const recipients = await accessField(pipeline, { type: 'field', value: 'recipients' } as any, { env });
    expect(asData<any[]>(recipients)).toEqual([]);
  });

  it('derives slot refs from transported shelf surfaces in local wrapper executables', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/exe @emitContact(id, name) = js {
  return {
    id,
    email: id + "@example.com",
    name
  };
} => contact
/exe @appendViaShelfSurface(stateShelf, value) = [
  let @slot = @stateShelf.recipients
  @shelf.write(@slot, @value)
]
/exe @readViaShelfSurface(stateShelf) = [
  let @slot = @stateShelf.recipients
  => @shelf.read(@slot)
]
@appendViaShelfSurface(@pipeline, @emitContact("c_1", "Mark"))
@appendViaShelfSurface(@pipeline, @emitContact("c_2", "Ava"))
/var @surfaceState = @readViaShelfSurface(@pipeline)
`);

    const surfaceState = env.getVariable('surfaceState')?.value;
    expect(asData<any[]>(surfaceState)).toHaveLength(2);

    const firstEntry = await accessField(surfaceState, { type: 'arrayIndex', value: 0 } as any, { env });
    const secondEntry = await accessField(surfaceState, { type: 'arrayIndex', value: 1 } as any, { env });
    const firstId = await accessField(firstEntry, { type: 'field', value: 'id' } as any, { env });
    const secondId = await accessField(secondEntry, { type: 'field', value: 'id' } as any, { env });
    expect(asData(firstId)).toBe('c_1');
    expect(asData(secondId)).toBe('c_2');
  });

  it('derives slot refs from transported shelf surfaces in imported wrapper executables', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/state.mld', `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/export { @pipeline }
`);
    await fs.writeFile('/worker.mld', `
/exe @appendViaShelfSurface(stateShelf, value) = [
  let @slot = @stateShelf.recipients
  @shelf.write(@slot, @value)
]
/exe @readViaShelfSurface(stateShelf) = [
  let @slot = @stateShelf.recipients
  => @shelf.read(@slot)
]
/export { @appendViaShelfSurface, @readViaShelfSurface }
`);
    await fs.writeFile('/app.mld', `
/import { @pipeline } from "/state.mld"
/import { @appendViaShelfSurface, @readViaShelfSurface } from "/worker.mld"
/exe @emitContact(id, name) = js {
  return {
    id,
    email: id + "@example.com",
    name
  };
} => contact
@appendViaShelfSurface(@pipeline, @emitContact("c_1", "Mark"))
@appendViaShelfSurface(@pipeline, @emitContact("c_2", "Ava"))
/var @surfaceState = @readViaShelfSurface(@pipeline)
`);

    const { ast } = await parse(await fs.readFile('/app.mld'), { mode: 'markdown' });
    const env = new Environment(fs, new PathService(), '/');
    env.setCurrentFilePath('/app.mld');
    await evaluate(ast, env);

    const surfaceState = env.getVariable('surfaceState')?.value;
    expect(asData<any[]>(surfaceState)).toHaveLength(2);

    const firstEntry = await accessField(surfaceState, { type: 'arrayIndex', value: 0 } as any, { env });
    const secondEntry = await accessField(surfaceState, { type: 'arrayIndex', value: 1 } as any, { env });
    const firstId = await accessField(firstEntry, { type: 'field', value: 'id' } as any, { env });
    const secondId = await accessField(secondEntry, { type: 'field', value: 'id' } as any, { env });
    expect(asData(firstId)).toBe('c_1');
    expect(asData(secondId)).toBe('c_2');
  });

  it('preserves slot references through nullish-coalescing assignment', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/var @active = @pipeline.recipients ?? null
`);

    const active = env.getVariable('active');
    expect(active).toBeDefined();
    expect(extractShelfSlotRef(active?.value)).toEqual({
      shelfName: 'pipeline',
      slotName: 'recipients'
    });
  });

  it('preserves optional slot references through nullish-coalescing assignment', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  selected: contact?
}
/var @active = @pipeline.selected ?? null
`);

    const active = env.getVariable('active');
    expect(active).toBeDefined();
    expect(extractShelfSlotRef(active?.value)).toEqual({
      shelfName: 'pipeline',
      slotName: 'selected'
    });
  });

  it('preserves slot references through nullish-coalescing let assignment inside wrapper executables', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/exe @clearViaCoalesce(slot) = [
  let @active = @slot ?? null
  @shelf.clear(@active)
]
@clearViaCoalesce(@pipeline.recipients)
`);

    const pipeline = env.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }

    const recipients = await accessField(pipeline, { type: 'field', value: 'recipients' } as any, { env });
    expect(extractShelfSlotRef(recipients)).toEqual({
      shelfName: 'pipeline',
      slotName: 'recipients'
    });
    expect(asData<any[]>(recipients)).toEqual([]);
  });

  it('preserves optional slot references through nullish-coalescing let assignment inside wrapper executables', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  selected: contact?
}
/exe @emitContact() = {
  id: "c_1",
  email: "mark@example.com",
  name: "Mark"
} => contact
/exe @writeViaCoalesce(slot) = [
  let @active = @slot ?? null
  when [
    @active => @shelf.write(@active, @emitContact())
    * => null
  ]
]
@writeViaCoalesce(@pipeline.selected)
`);

    const pipeline = env.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }

    const selected = await accessField(pipeline, { type: 'field', value: 'selected' } as any, { env });
    expect(extractShelfSlotRef(selected)).toEqual({
      shelfName: 'pipeline',
      slotName: 'selected'
    });

    const id = await accessField(selected, { type: 'field', value: 'id' } as any, { env });
    expect(asData(id)).toBe('c_1');
  });

  it('preserves imported shelf slot references through imported wrapper executables', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/state.mld', `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/export { @pipeline }
`);
    await fs.writeFile('/worker.mld', `
/exe @clearViaCoalesce(slot) = [
  let @active = @slot ?? null
  @shelf.clear(@active)
]
/export { @clearViaCoalesce }
`);
    await fs.writeFile('/app.mld', `
/import { @pipeline } from "/state.mld"
/import { @clearViaCoalesce } from "/worker.mld"
@clearViaCoalesce(@pipeline.recipients)
`);

    const { ast } = await parse(await fs.readFile('/app.mld'), { mode: 'markdown' });
    const env = new Environment(fs, new PathService(), '/');
    env.setCurrentFilePath('/app.mld');
    await evaluate(ast, env);

    const pipeline = env.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }

    const recipients = await accessField(pipeline, { type: 'field', value: 'recipients' } as any, { env });
    expect(extractShelfSlotRef(recipients)).toEqual({
      shelfName: 'pipeline',
      slotName: 'recipients'
    });
    expect(asData<any[]>(recipients)).toEqual([]);
  });

  it('preserves imported optional shelf slot references through imported wrapper executables', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/state.mld', `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  selected: contact?
}
/export { @pipeline }
`);
    await fs.writeFile('/worker.mld', `
/exe @writeViaCoalesce(slot, value) = [
  let @active = @slot ?? null
  when [
    @active => @shelf.write(@active, @value)
    * => null
  ]
]
/export { @writeViaCoalesce }
`);
    await fs.writeFile('/app.mld', `
/import { @pipeline } from "/state.mld"
/import { @writeViaCoalesce } from "/worker.mld"
/exe @emitContact() = {
  id: "c_1",
  email: "mark@example.com",
  name: "Mark"
} => contact
@writeViaCoalesce(@pipeline.selected, @emitContact())
`);

    const { ast } = await parse(await fs.readFile('/app.mld'), { mode: 'markdown' });
    const env = new Environment(fs, new PathService(), '/');
    env.setCurrentFilePath('/app.mld');
    await evaluate(ast, env);

    const pipeline = env.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }

    const selected = await accessField(pipeline, { type: 'field', value: 'selected' } as any, { env });
    expect(extractShelfSlotRef(selected)).toEqual({
      shelfName: 'pipeline',
      slotName: 'selected'
    });

    const id = await accessField(selected, { type: 'field', value: 'id' } as any, { env });
    expect(asData(id)).toBe('c_1');
  });

  it('preserves imported optional shelf slot references through imported helper loops', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/state.mld', `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  selected: contact?
}
/export { @pipeline }
`);
    await fs.writeFile('/helper.mld', `
/exe @writeViaParam(slot, value) = [
  @shelf.write(@slot, @value)
]
/export { @writeViaParam }
`);
    await fs.writeFile('/worker.mld', `
/import { @writeViaParam } from "/helper.mld"
/exe @writeViaImportedHelperLoop(slot, value) = loop(2) [
  let @state = @input ?? { done: false }
  let @active = @slot ?? null
  when @state.done [
    true => done @shelf.read(@active)
    * => [
      when [
        @active => @writeViaParam(@active, @value)
        * => null
      ]
      continue { done: true }
    ]
  ]
]
/export { @writeViaImportedHelperLoop }
`);
    await fs.writeFile('/app.mld', `
/import { @pipeline } from "/state.mld"
/import { @writeViaImportedHelperLoop } from "/worker.mld"
/exe @emitContact() = {
  id: "c_1",
  email: "mark@example.com",
  name: "Mark"
} => contact
/var @result = @writeViaImportedHelperLoop(@pipeline.selected, @emitContact())
`);

    const { ast } = await parse(await fs.readFile('/app.mld'), { mode: 'markdown' });
    const env = new Environment(fs, new PathService(), '/');
    env.setCurrentFilePath('/app.mld');
    await evaluate(ast, env);

    const pipeline = env.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }

    const selected = await accessField(pipeline, { type: 'field', value: 'selected' } as any, { env });
    expect(extractShelfSlotRef(selected)).toEqual({
      shelfName: 'pipeline',
      slotName: 'selected'
    });

    const id = await accessField(selected, { type: 'field', value: 'id' } as any, { env });
    expect(asData(id)).toBe('c_1');
    const resultId = await accessField(env.getVariable('result')?.value, { type: 'field', value: 'id' } as any, { env });
    expect(asData(resultId)).toBe('c_1');
  });

  it('reads imported shelf slot refs back through imported wrapper executables', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/state.mld', `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/export { @pipeline }
`);
    await fs.writeFile('/worker.mld', `
/exe @appendViaParam(slot, value) = [
  @shelf.write(@slot, @value)
]
/exe @readViaParam(slot) = @shelf.read(@slot)
/export { @appendViaParam, @readViaParam }
`);
    await fs.writeFile('/app.mld', `
/import { @pipeline } from "/state.mld"
/import { @appendViaParam, @readViaParam } from "/worker.mld"
/exe @emitContact(id, name) = js {
  return {
    id,
    email: id + "@example.com",
    name
  };
} => contact
@appendViaParam(@pipeline.recipients, @emitContact("c_1", "Mark"))
/var @firstState = @readViaParam(@pipeline.recipients)
@appendViaParam(@pipeline.recipients, @emitContact("c_2", "Ava"))
/var @secondState = @readViaParam(@pipeline.recipients)
`);

    const { ast } = await parse(await fs.readFile('/app.mld'), { mode: 'markdown' });
    const env = new Environment(fs, new PathService(), '/');
    env.setCurrentFilePath('/app.mld');
    await evaluate(ast, env);

    expect(asData<any[]>(env.getVariable('firstState')?.value)).toHaveLength(1);

    const secondState = env.getVariable('secondState')?.value;
    expect(asData<any[]>(secondState)).toHaveLength(2);

    const firstEntry = await accessField(secondState, { type: 'arrayIndex', value: 0 } as any, { env });
    const secondEntry = await accessField(secondState, { type: 'arrayIndex', value: 1 } as any, { env });
    const firstId = await accessField(firstEntry, { type: 'field', value: 'id' } as any, { env });
    const secondId = await accessField(secondEntry, { type: 'field', value: 'id' } as any, { env });

    expect(asData(firstId)).toBe('c_1');
    expect(asData(secondId)).toBe('c_2');
  });

  it('preserves captured imported shelf state inside imported executables', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/state.mld', `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @workspace_state = {
  trusted: contact?
}
/export { @workspace_state }
`);
    await fs.writeFile('/runner.mld', `
/import { @workspace_state } from "/state.mld"
/import { @writeViaParam } from "/helper.mld"
/exe @emitContact() = {
  id: "c_1",
  email: "mark@example.com",
  name: "Mark"
} => contact
/exe @run() = [
  => @writeViaParam(@workspace_state.trusted, @emitContact())
]
/export { @run }
`);
    await fs.writeFile('/helper.mld', `
/exe @writeViaParam(slot, value) = [
  @shelf.write(@slot, @value)
  => @shelf.read(@slot)
]
/export { @writeViaParam }
`);
    await fs.writeFile('/app.mld', `
/import { @run } from "/runner.mld"
/var @result = @run()
`);

    const { ast } = await parse(await fs.readFile('/app.mld'), { mode: 'markdown' });
    const env = new Environment(fs, new PathService(), '/');
    env.setCurrentFilePath('/app.mld');
    await evaluate(ast, env);

    const id = await accessField(env.getVariable('result')?.value, { type: 'field', value: 'id' } as any, { env });
    expect(asData(id)).toBe('c_1');
  });

  it('preserves imported shelf slot references through nested local wrapper executables', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/state.mld', `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/export { @pipeline }
`);
    await fs.writeFile('/worker.mld', `
/exe @clearViaCoalesce(slot) = [
  let @active = @slot ?? null
  @shelf.clear(@active)
]
/export { @clearViaCoalesce }
`);
    await fs.writeFile('/app.mld', `
/import { @pipeline } from "/state.mld"
/import { @clearViaCoalesce } from "/worker.mld"
/exe @wrapper() = [
  @clearViaCoalesce(@pipeline.recipients)
]
@wrapper()
`);

    const { ast } = await parse(await fs.readFile('/app.mld'), { mode: 'markdown' });
    const env = new Environment(fs, new PathService(), '/');
    env.setCurrentFilePath('/app.mld');
    await evaluate(ast, env);

    const pipeline = env.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }

    const recipients = await accessField(pipeline, { type: 'field', value: 'recipients' } as any, { env });
    expect(extractShelfSlotRef(recipients)).toEqual({
      shelfName: 'pipeline',
      slotName: 'recipients'
    });
    expect(asData<any[]>(recipients)).toEqual([]);
  });

  it('preserves imported shelf slot references through when-action wrapper flows', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile('/state.mld', `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/export { @pipeline }
`);
    await fs.writeFile('/worker.mld', `
/exe @clearViaWhen(slot) = [
  let @active = @slot ?? null
  when [
    @active => @shelf.clear(@active)
    * => null
  ]
]
/export { @clearViaWhen }
`);
    await fs.writeFile('/app.mld', `
/import { @pipeline } from "/state.mld"
/import { @clearViaWhen } from "/worker.mld"
/exe @wrapper() = [
  @clearViaWhen(@pipeline.recipients)
]
@wrapper()
`);

    const { ast } = await parse(await fs.readFile('/app.mld'), { mode: 'markdown' });
    const env = new Environment(fs, new PathService(), '/');
    env.setCurrentFilePath('/app.mld');
    await evaluate(ast, env);

    const pipeline = env.getVariable('pipeline');
    if (!pipeline) {
      throw new Error('Expected @pipeline to be defined');
    }

    const recipients = await accessField(pipeline, { type: 'field', value: 'recipients' } as any, { env });
    expect(extractShelfSlotRef(recipients)).toEqual({
      shelfName: 'pipeline',
      slotName: 'recipients'
    });
    expect(asData<any[]>(recipients)).toEqual([]);
  });

  it('treats empty shelf slot refs as present in when guards for writes and scoped boxes', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  recipients: contact[]
}
/exe @emitContact() = js {
  return {
    id: "c_1",
    email: "mark@example.com",
    name: "Mark"
  };
} => contact
/var @boxRead = when [
  @pipeline.recipients => box {
    shelf: {
      read: [@pipeline.recipients as recipients]
    }
  } [
    => @fyi.shelf.recipients
  ]
  * => "missing"
]
/exe @appendIfPresent() = [
  when [
    @pipeline.recipients => @shelf.write(@pipeline.recipients, @emitContact())
    * => null
  ]
]
@appendIfPresent()
/var @final = @shelf.read(@pipeline.recipients)
`);

    expect(asData(env.getVariable('boxRead')?.value)).toEqual([]);
    expect(asData<any[]>(env.getVariable('final')?.value)).toHaveLength(1);
  });
});
