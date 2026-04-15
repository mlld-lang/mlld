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

exe tool:w @delete_draft(id) = cmd { echo "ok" }
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

exe destructive:targeted, tool:w @delete_draft(id) = cmd { echo "ok" }
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

  it('validates policy authorizations reached through union references', async () => {
    const modulePath = await writeModule('policy-union-authorizations-invalid.mld', `record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string, body: string],
  validate: "strict"
}

var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    labels: ["execute:w"]
  }
}

var @basePolicy = {
  authorizations: {
    allow: {
      send_email: true
    }
  }
}

policy @task = union(@basePolicy)

exe tool:w @send_email(recipient, subject, body) = cmd { echo "ok" }
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message).join('\n')).toContain(
      'cannot use true in policy.authorizations'
    );
  });

  it('accepts valid policy can_authorize role declarations', async () => {
    const modulePath = await writeModule('policy-can-authorize-valid.mld', `record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string, body: string],
  validate: "strict"
}

var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    labels: ["execute:w"]
  }
}

policy @task = {
  authorizations: {
    can_authorize: {
      role:planner: [@send_email]
    }
  }
}

exe tool:w @send_email(recipient, subject, body) = cmd { echo "ok" }
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect((result.errors ?? []).length).toBe(0);
    expect((result.antiPatterns ?? []).filter(
      entry => entry.code === 'policy-authorizations-can-authorize-unknown-tool'
    )).toHaveLength(0);
  });

  it('diagnoses invalid can_authorize role keys and denied tool conflicts', async () => {
    const modulePath = await writeModule('policy-can-authorize-invalid.mld', `record @delete_file_inputs = {
  facts: [id: string],
  validate: "strict"
}

var tools @agentTools = {
  delete_file: {
    mlld: @delete_file,
    inputs: @delete_file_inputs,
    labels: ["execute:w"]
  }
}

policy @task = {
  authorizations: {
    deny: ["delete_file"],
    can_authorize: {
      planner: [@delete_file]
    }
  }
}

exe destructive:targeted, tool:w @delete_file(id) = cmd { echo "ok" }
`);

    const result = await analyze(modulePath, { checkVariables: false });
    expect(result.valid).toBe(false);
    const messages = (result.errors ?? []).map(entry => entry.message).join('\n');
    expect(messages).toContain("policy.authorizations.can_authorize key 'planner' must use a role:* label");
    expect(messages).toContain("Tool 'delete_file' cannot appear under policy.authorizations.can_authorize.planner because it is denied by policy.authorizations.deny");
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

exe tool:w @delete_draft(id) = cmd { echo "ok" }
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
