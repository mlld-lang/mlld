import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyze } from './analyze';

describe('analyze box shelf scope diagnostics', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-box-shelf-analyze-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeModule(filename: string, content: string): Promise<string> {
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('accepts aliased box writes that use variable-held slot refs', async () => {
    const modulePath = await writeModule('analyze-box-shelf-dynamic-slot-ref.mld', `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}

/shelf @workspace = {
  execution_log: contact[],
  selected: contact? from execution_log
}

/exe @emitContact() = {
  id: "c_1",
  email: "c_1@example.com",
  name: "Mark"
} => contact

/exe @writeSelected(slotName) = [
  let @selectedSlot = @workspace[@slotName]
  box {
    shelf: {
      read: [@workspace.execution_log as execution_log],
      write: [@selectedSlot as selected]
    }
  } [
    let @entry = @emitContact()
    @shelf.write(@fyi.shelf.execution_log, @entry)
    @shelf.write(@fyi.shelf.selected, @entry)
  ]
]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect((result.errors ?? []).map(entry => entry.message)).not.toContain(
      'box.shelf.write aliases must resolve to shelf slot references'
    );
  });

  it('still rejects inline non-slot values in aliased box writes', async () => {
    const modulePath = await writeModule('analyze-box-shelf-inline-non-slot.mld', `
/record @contact = {
  key: id,
  facts: [id: string]
}

/shelf @workspace = {
  selected: contact?
}

/box {
  shelf: {
    write: [{ alias: "selected", value: { nope: true } }]
  }
} [
  => @input
]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message)).toContain(
      'box.shelf.write aliases must resolve to shelf slot references'
    );
  });
});
