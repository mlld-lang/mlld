import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyze } from './analyze';

describe('analyze thin-arrow return channel warnings', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-thin-arrow-analyze-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeModule(filename: string, content: string): Promise<string> {
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('warns when an exe uses tool-return channels but is never surfaced via var tools', async () => {
    const modulePath = await writeModule('thin-arrow-not-surfaced.mld', `/exe @route(task) = [
  when @task.mode == "fast" => [-> "fast"]
  => "slow"
]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'thin-arrow-exe-not-surfaced'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('@route()');
  });

  it('does not warn when a thin-arrow exe is wired through a var tools collection', async () => {
    const modulePath = await writeModule('thin-arrow-surfaced.mld', `/exe @send_email(to, subject, body) = [
  -> "sent"
] => record @SendEmailResult

/record @SendEmailResult = {
  facts: [channel],
  data: [body]
}

/var tools @writeTools = {
  send_email: {
    mlld: @send_email,
    description: "send an email"
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    const notSurfacedWarnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'thin-arrow-exe-not-surfaced'
    );
    expect(notSurfacedWarnings).toHaveLength(0);
  });

  it('warns when a thin-arrow exe declares no static output record', async () => {
    const modulePath = await writeModule('thin-arrow-missing-record.mld', `/exe @send_email(to, subject) = [
  -> "sent"
]

/var tools @writeTools = {
  send_email: { mlld: @send_email }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'strict-tool-return-without-record'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.suggestion).toContain('=> record');
  });

  it('does not warn when a thin-arrow exe pairs with a static => record coercion', async () => {
    const modulePath = await writeModule('thin-arrow-with-record.mld', `/record @SendResult = {
  facts: [channel]
}

/exe @send_email(to) = [
  -> "sent"
] => record @SendResult

/var tools @writeTools = {
  send_email: { mlld: @send_email }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    const missingRecord = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'strict-tool-return-without-record'
    );
    expect(missingRecord).toHaveLength(0);
  });

  it('warns when tool-return sites appear both inside and outside a for body', async () => {
    const modulePath = await writeModule('thin-arrow-mixed-for.mld', `/record @BatchResult = {
  facts: [status]
}

/exe @sendBatch(emails) = [
  when @emails == none => [-> "empty"]
  for @email in @emails => [
    -> "sent"
  ]
] => record @BatchResult

/var tools @writeTools = {
  sendBatch: { mlld: @sendBatch }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'mixed-tool-return-for-scope'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('every tool reach is inside');
  });

  it('does not warn on a pure for-body thin-arrow exe', async () => {
    const modulePath = await writeModule('thin-arrow-for-only.mld', `/record @BatchResult = {
  facts: [status]
}

/exe @sendBatch(emails) = for @email in @emails => [
  -> "sent"
] => record @BatchResult

/var tools @writeTools = {
  sendBatch: { mlld: @sendBatch }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    const mixedWarnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'mixed-tool-return-for-scope'
    );
    expect(mixedWarnings).toHaveLength(0);
  });

  it('does not warn on canonical-only exes', async () => {
    const modulePath = await writeModule('canonical-only.mld', `/exe @plain(x) = [
  => @x
]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    const thinArrowWarnings = (result.antiPatterns ?? []).filter(entry =>
      entry.code === 'thin-arrow-exe-not-surfaced' ||
      entry.code === 'strict-tool-return-without-record' ||
      entry.code === 'mixed-tool-return-for-scope'
    );
    expect(thinArrowWarnings).toHaveLength(0);
  });
});
