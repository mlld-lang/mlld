import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { accessField } from '@interpreter/utils/field-access';
import { normalizeScopedShelfConfig } from '@interpreter/shelf/runtime';

async function createEnvironment(source: string, filePath = '/main.mld'): Promise<{
  env: Environment;
  effects: TestEffectHandler;
}> {
  const fs = new MemoryFileSystem();
  await fs.writeFile(filePath, source);
  const env = new Environment(fs, new PathService(), '/');
  const effects = new TestEffectHandler();
  env.setEffectHandler(effects);
  env.setCurrentFilePath(filePath);
  const { ast } = await parse(source, { mode: 'markdown' });
  await evaluate(ast, env);
  return { env, effects };
}

async function evaluateToOutput(source: string, env: Environment, effects: TestEffectHandler): Promise<string> {
  const { ast } = await parse(source, { mode: 'markdown' });
  await evaluate(ast, env);
  env.renderOutput();
  return effects
    .getEffects()
    .filter(effect => effect.type === 'doc' || effect.type === 'both')
    .map(effect => String(effect.content))
    .join('');
}

describe('shelf notes injection', () => {
  it('injects shelf notes for llm calls inside shelf-scoped environments even without config.tools', async () => {
    const { env, effects } = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @outreach = {
  recipients: contact[],
  selected: contact? from recipients
}
/var @taskBrief = "Pick one recipient"
/exe llm @agent(prompt, config) = js {
  return config && typeof config === "object" ? (config.system ?? "") : "";
}
`);

    try {
      const outreach = env.getVariable('outreach');
      const taskBrief = env.getVariable('taskBrief');
      if (!outreach || !taskBrief) {
        throw new Error('Expected shelf and alias variables to be defined');
      }

      const recipientsRef = await accessField(outreach, { type: 'field', value: 'recipients' } as any, { env });
      const selectedRef = await accessField(outreach, { type: 'field', value: 'selected' } as any, { env });
      const scopedEnv = env.createChild();
      const scope = await normalizeScopedShelfConfig({ read: [recipientsRef], write: [selectedRef] }, env);
      scope.readAliases = { brief: taskBrief };
      scopedEnv.setScopedEnvironmentConfig({ shelf: scope });

      const output = await evaluateToOutput('/show @agent("Pick the recipient")', scopedEnv, effects);

      expect(output).toContain('<shelf_notes>');
      expect(output).not.toContain('<tool_notes>');
      expect(output).toContain('| @fyi.shelf.outreach.selected | contact? | replace | from recipients |');
      expect(output).toContain('| @fyi.shelf.outreach.recipients | contact[] |');
      expect(output).toContain('| @fyi.shelf.brief | text |');
      expect(output).toContain('Write to slots with @shelf.write(@fyi.shelf.outreach.selected, value) or @shelve(@fyi.shelf.outreach.selected, value).');
      expect(output).toContain('Read shelf entries with @fyi.shelf.outreach.recipients');
    } finally {
      env.cleanup();
    }
  });

  it('appends shelf notes after tool notes in user-authored config.system content', async () => {
    const { env, effects } = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @outreach = {
  recipients: contact[],
  selected: contact? from recipients
}
/var @taskBrief = "Pick one recipient"
/exe tool:w @sendEmail(recipient, subject, body) = "sent" with { controlArgs: ["recipient"] }
/var tools @toolList = {
  send_email: {
    mlld: @sendEmail,
    expose: ["recipient", "subject", "body"]
  }
}
/exe llm @agent(prompt, config) = js { return config.system ?? ""; }
`);

    try {
      const outreach = env.getVariable('outreach');
      const taskBrief = env.getVariable('taskBrief');
      if (!outreach || !taskBrief) {
        throw new Error('Expected shelf and alias variables to be defined');
      }

      const recipientsRef = await accessField(outreach, { type: 'field', value: 'recipients' } as any, { env });
      const selectedRef = await accessField(outreach, { type: 'field', value: 'selected' } as any, { env });
      const scopedEnv = env.createChild();
      const scope = await normalizeScopedShelfConfig({ read: [recipientsRef], write: [selectedRef] }, env);
      scope.readAliases = { brief: taskBrief };
      scopedEnv.setScopedEnvironmentConfig({ shelf: scope });

      const output = await evaluateToOutput(
        '/show @agent("Send the message", { tools: @toolList, system: "User system prompt" })',
        scopedEnv,
        effects
      );

      expect(output).toContain('User system prompt\n\n<tool_notes>');
      expect(output).toContain('</tool_notes>\n\n<shelf_notes>');
      expect(output.indexOf('<tool_notes>')).toBeGreaterThan(output.indexOf('User system prompt'));
      expect(output.indexOf('<shelf_notes>')).toBeGreaterThan(output.indexOf('<tool_notes>'));
      expect(output).toContain('| send_email | recipient | @fyi.known("send_email") |');
      expect(output).toContain('| @fyi.shelf.outreach.selected | contact? | replace | from recipients |');
      expect(output).toContain('| @fyi.shelf.brief | text |');
    } finally {
      env.cleanup();
    }
  });

  it('auto-provisions an llm bridge for writable shelf scope even without config.tools', async () => {
    const { env, effects } = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @outreach = {
  recipients: contact[]
}
/exe @ping() = "pong"
/exe llm @agent(prompt, config) = [
  => when [
    @mx.llm => @mx.llm.allowed
    * => ""
  ]
]
`);

    try {
      const outreach = env.getVariable('outreach');
      if (!outreach) {
        throw new Error('Expected @outreach to be defined');
      }

      const recipientsRef = await accessField(outreach, { type: 'field', value: 'recipients' } as any, { env });
      const scopedEnv = env.createChild();
      const scope = await normalizeScopedShelfConfig({
        write: [{ alias: 'things', value: recipientsRef }]
      }, env);
      scopedEnv.setScopedEnvironmentConfig({ shelf: scope });

      const output = await evaluateToOutput('/show @agent("Pick the recipient")', scopedEnv, effects);
      expect(output.trim()).toBe('mcp__mlld_tools__shelve');

      effects.clear();
      const mixedOutput = await evaluateToOutput('/show @agent("Pick the recipient", { tools: [@ping] })', scopedEnv, effects);
      expect(mixedOutput.trim()).toBe('mcp__mlld_tools__ping,mcp__mlld_tools__shelve');
    } finally {
      env.cleanup();
    }
  });

  it('keeps read-only shelf scope unbridged when config.tools is omitted', async () => {
    const { env, effects } = await createEnvironment(`
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @outreach = {
  recipients: contact[]
}
/exe llm @agent(prompt, config) = [
  => when [
    @mx.llm => @mx.llm.allowed
    * => ""
  ]
]
`);

    try {
      const outreach = env.getVariable('outreach');
      if (!outreach) {
        throw new Error('Expected @outreach to be defined');
      }

      const recipientsRef = await accessField(outreach, { type: 'field', value: 'recipients' } as any, { env });
      const scopedEnv = env.createChild();
      const scope = await normalizeScopedShelfConfig({ read: [recipientsRef] }, env);
      scopedEnv.setScopedEnvironmentConfig({ shelf: scope });

      const output = await evaluateToOutput('/show @agent("Pick the recipient")', scopedEnv, effects);
      expect(output.trim()).toBe('');
    } finally {
      env.cleanup();
    }
  });
});
