import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { accessField } from '@interpreter/utils/field-access';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { extractShelfSlotRef, normalizeScopedShelfConfig } from '@interpreter/shelf/runtime';

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

  it('projects readable slot contents through @fyi.shelf and hides @shelve for read-only scopes', async () => {
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

    expect(readOnlyEnv.hasVariable('shelve')).toBe(false);

    const fyi = readOnlyEnv.getVariable('fyi');
    if (!fyi) {
      throw new Error('Expected @fyi to be defined');
    }
    const shelfView = await accessField(fyi, { type: 'field', value: 'shelf' } as any, { env: readOnlyEnv });
    const outreachView = await accessField(shelfView, { type: 'field', value: 'outreach' } as any, { env: readOnlyEnv });
    const projectedRecipients = await accessField(outreachView, { type: 'field', value: 'recipients' } as any, { env: readOnlyEnv });

    expect(projectedRecipients).toEqual([
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

    expect(writableEnv.hasVariable('shelve')).toBe(true);
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

  it('preserves slot references through wrapper executables that call @shelve methods', async () => {
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
  @shelve(@slot, @value)
]
/exe @removeViaParam(slot, value) = [
  @shelve.remove(@slot, @value)
]
/exe @clearViaParam(slot) = [
  @shelve.clear(@slot)
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

  it('reads current slot contents back through @shelve.read using slot-ref params', async () => {
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
  @shelve(@slot, @value)
]
/exe @readViaParam(slot) = @shelve.read(@slot)
@appendViaParam(@pipeline.recipients, @emitContact("c_1", "Mark"))
/var @firstState = @readViaParam(@pipeline.recipients)
@appendViaParam(@pipeline.recipients, @emitContact("c_2", "Ava"))
/var @secondState = @readViaParam(@pipeline.recipients)
/var @directState = @shelve.read(@pipeline.recipients)
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
  @shelve.clear(@active)
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
  @shelve.clear(@active)
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
  @shelve(@slot, @value)
]
/exe @readViaParam(slot) = @shelve.read(@slot)
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
  @shelve.clear(@active)
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
    @active => @shelve.clear(@active)
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
});
