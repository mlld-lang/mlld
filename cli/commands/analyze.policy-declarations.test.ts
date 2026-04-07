import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyze } from './analyze';

describe('analyze policy declaration warnings', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-policy-analyze-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeModule(filename: string, content: string): Promise<string> {
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('warns when policy operations map to labels missing from the validation context', async () => {
    const modulePath = await writeModule('policy-operations-missing-label.mld', `policy @task = {
  operations: {
    destructive: ["tool:x"]
  }
}

exe tool:w @delete_draft(id) = cmd { echo "ok" } with { controlArgs: ["id"] }
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'policy-operations-unknown-label'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('operations.destructive');
    expect(warnings[0]?.message).toContain('"tool:x"');
    expect(warnings[0]?.suggestion).toContain('tool:w');
  });

  it('warns when policy authorizations.deny references an unknown tool name', async () => {
    const modulePath = await writeModule('policy-deny-unknown-tool.mld', `policy @task = {
  authorizations: {
    deny: ["delete_drfat"]
  }
}

exe destructive:targeted, tool:w @delete_draft(id) = cmd { echo "ok" } with { controlArgs: ["id"] }
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'policy-authorizations-deny-unknown-tool'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("unknown tool 'delete_drfat'");
    expect(warnings[0]?.suggestion).toContain('delete_draft');
  });

  it('warns when policy label-flow targets do not match declared categories or context labels', async () => {
    const modulePath = await writeModule('policy-label-flow-unknown-target.mld', `policy @task = {
  operations: {
    destructive: ["tool:w"]
  },
  labels: {
    secret: {
      deny: ["destructvie"]
    }
  }
}

exe tool:w @delete_draft(id) = cmd { echo "ok" } with { controlArgs: ["id"] }
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'policy-label-flow-unknown-target'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('labels.secret.deny');
    expect(warnings[0]?.message).toContain('"destructvie"');
    expect(warnings[0]?.suggestion).toContain('destructive');
  });

  it('does not warn on custom label-flow targets when no validation context makes them knowable', async () => {
    const modulePath = await writeModule('policy-label-flow-custom-target.mld', `policy @task = {
  labels: {
    secret: {
      deny: ["acme-internal"]
    }
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect((result.antiPatterns ?? []).filter(
      entry => entry.code === 'policy-label-flow-unknown-target'
    )).toHaveLength(0);
  });
});
