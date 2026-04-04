import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { accessField } from '@interpreter/utils/field-access';
import { wrapStructured } from '@interpreter/utils/structured-value';
import { normalizeScopedShelfConfig } from '@interpreter/shelf/runtime';
import { renderInjectedShelfNotes } from './shelf-notes';

async function createEnvironment(source: string, filePath = '/main.mld'): Promise<Environment> {
  const fs = new MemoryFileSystem();
  await fs.writeFile(filePath, source);
  const env = new Environment(fs, new PathService(), '/');
  env.setCurrentFilePath(filePath);
  const { ast } = await parse(source, { mode: 'markdown' });
  await evaluate(ast, env);
  return env;
}

describe('shelf notes', () => {
  it('renders writable slots, readable slots, and alias types from the agent-visible shelf view', async () => {
    const env = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
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

    try {
      const outreach = env.getVariable('outreach');
      const recipient = env.getVariable('recipient');
      if (!outreach || !recipient) {
        throw new Error('Expected shelf and record variables to be defined');
      }

      const recipientsRef = await accessField(outreach, { type: 'field', value: 'recipients' } as any, { env });
      const selectedRef = await accessField(outreach, { type: 'field', value: 'selected' } as any, { env });
      const scopedEnv = env.createChild();
      const scope = await normalizeScopedShelfConfig({ read: [recipientsRef], write: [selectedRef] }, env);
      scope.readSlotBindings = scope.readSlotBindings.map(binding =>
        binding.ref.shelfName === 'outreach' && binding.ref.slotName === 'selected'
          ? { ref: binding.ref, alias: 'selection' }
          : binding
      );
      scope.writeSlotBindings = scope.writeSlotBindings.map(binding =>
        binding.ref.shelfName === 'outreach' && binding.ref.slotName === 'selected'
          ? { ref: binding.ref, alias: 'selection' }
          : binding
      );
      scope.readAliases = {
        brief: wrapStructured('Pick one recipient', 'text', 'Pick one recipient'),
        audience: recipientsRef,
        chosen: recipient,
        stats: wrapStructured({ total: 1 }, 'object', '{"total":1}'),
        count: wrapStructured(3, 'number', '3'),
        tags: wrapStructured(['urgent'], 'array', '["urgent"]')
      };
      scopedEnv.setScopedEnvironmentConfig({ shelf: scope });

      const notes = renderInjectedShelfNotes(scopedEnv);
      expect(notes).toContain('<shelf_notes>');
      expect(notes).toContain('| @fyi.shelf.selection | contact? | replace | from recipients |');
      expect(notes).toContain('| @fyi.shelf.outreach.recipients | contact[] |');
      expect(notes).toContain('| @fyi.shelf.brief | text |');
      expect(notes).toContain('| @fyi.shelf.audience | contact[] |');
      expect(notes).toContain('| @fyi.shelf.chosen | contact |');
      expect(notes).toContain('| @fyi.shelf.stats | object |');
      expect(notes).toContain('| @fyi.shelf.count | number |');
      expect(notes).toContain('| @fyi.shelf.tags | array |');
      expect(notes).toContain('Write to slots with @shelve(@fyi.shelf.selection, value).');
      expect(notes).toContain('Read shelf entries with @fyi.shelf.outreach.recipients');
      expect(notes).toContain('Collection slots use [] and follow the listed Merge mode.');
    } finally {
      env.cleanup();
    }
  });

  it('returns no notes when the scoped shelf view is empty', async () => {
    const env = await createEnvironment('/var @noop = "ok"');

    try {
      const scopedEnv = env.createChild();
      scopedEnv.setScopedEnvironmentConfig({
        shelf: {
          __mlldShelfScope: true,
          readSlots: [],
          writeSlots: [],
          readAliases: {},
          readSlotBindings: [],
          writeSlotBindings: []
        }
      });

      expect(renderInjectedShelfNotes(scopedEnv)).toBeUndefined();
    } finally {
      env.cleanup();
    }
  });
});
