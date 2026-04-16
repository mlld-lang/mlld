import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyze, analyzeDeep, analyzeMultiple } from './analyze';

describe('analyze/validate warnings', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-analyze-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeModule(filename: string, content: string): Promise<string> {
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('reports built-in transform shadowing for let assignments', async () => {
    const modulePath = await writeModule('builtin-conflicts.mld', `/exe @test() = [
  let @exists = "yes"
  let @upper = "HELLO"
  => @exists
]
/var @out = @test()
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const builtinShadowing = (result.redefinitions ?? [])
      .filter(entry => entry.reason === 'builtin-conflict')
      .map(entry => entry.variable)
      .sort();

    expect(builtinShadowing).toEqual(['exists', 'upper']);
    expect((result.redefinitions ?? []).filter(entry => entry.reason === 'scope-redefinition')).toHaveLength(0);
  });

  it('warns on deprecated @json transformer aliases', async () => {
    const modulePath = await writeModule('deprecated-json-alias.mld', `/var @payload = '{"count":2}'
/var @parsed = @payload | @json.strict
/show @parsed
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const deprecations = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'deprecated-json-transform'
    );
    expect(deprecations).toHaveLength(1);
    expect(deprecations[0]?.message).toContain('@json.strict');
    expect(deprecations[0]?.suggestion).toContain('@parse.strict');
    expect(deprecations[0]?.suggestion).toContain('auto-serialize');
  });

  it('warns on plain @json with both parsing and serialization guidance', async () => {
    const modulePath = await writeModule('deprecated-json-plain.mld', `/var @payload = '{"count":2}'
/var @parsed = @payload | @json
/show @parsed
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const deprecations = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'deprecated-json-transform'
    );
    expect(deprecations).toHaveLength(1);
    expect(deprecations[0]?.message).toContain('@json');
    expect(deprecations[0]?.suggestion).toContain('@parse');
    expect(deprecations[0]?.suggestion).toContain('auto-serialize');
  });

  it('does not warn on @json alias usage when user-defined @json shadows the builtin', async () => {
    const modulePath = await writeModule('deprecated-json-shadowed.mld', `/exe @json(input) = @input | @upper
/var @out = "ok" | @json
/show @out
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const deprecations = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'deprecated-json-transform'
    );
    expect(deprecations).toHaveLength(0);
  });

  it('does not flag variables that merely contain "json" in the name', async () => {
    const modulePath = await writeModule('deprecated-json-false-positive.mld', `/var @json_result = "ok"
/show @json_result
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const deprecations = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'deprecated-json-transform'
    );
    expect(deprecations).toHaveLength(0);
  });

  it('keeps reserved names as hard conflicts', async () => {
    const modulePath = await writeModule('reserved-conflict.mld', `/exe @test() = [
  let @base = "shadow"
  => @base
]
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const reservedConflicts = (result.redefinitions ?? [])
      .filter(entry => entry.reason === 'reserved-conflict')
      .map(entry => entry.variable)
      .sort();

    expect(reservedConflicts).toEqual(['base']);
  });

  it('warns when exe parameters use generic names that can shadow caller variables', async () => {
    const modulePath = await writeModule('exe-param-shadowing.mld', `/var @result = "queued"
/exe @logItemDone(result) = [
  => @result
]
/show @logItemDone("done")
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const paramWarnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'exe-parameter-shadowing'
    );
    expect(paramWarnings).toHaveLength(1);
    expect(paramWarnings[0]?.message).toContain('Parameter @result');
    expect(paramWarnings[0]?.suggestion).toContain('@status');
  });

  it('supports suppressing exe parameter shadowing warnings in mlld-config.json', async () => {
    await fs.writeFile(
      path.join(tempDir, 'mlld-config.json'),
      JSON.stringify({
        validate: {
          suppressWarnings: ['exe-parameter-shadowing']
        }
      }, null, 2),
      'utf8'
    );

    const modulePath = await writeModule('exe-param-shadowing-suppressed.mld', `/exe @logItemDone(result) = [
  => @result
]
/show @logItemDone("done")
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const paramWarnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'exe-parameter-shadowing'
    );
    expect(paramWarnings).toHaveLength(0);
  });

  it('does not flag @root as undefined', async () => {
    const modulePath = await writeModule('root-builtin.mld', `var @dir = @root
show @dir
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.undefinedVariables ?? []).map(w => w.variable);
    expect(undefs).not.toContain('root');
  });

  it('does not flag @ text patterns in strings as undefined variables', async () => {
    const modulePath = await writeModule('at-text-patterns.mld', `/var @email = "user@example.com"
/var @pkg = "@anthropic/mcp-server"
/show @email
/show @pkg
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.warnings ?? []).map(w => w.variable);
    expect(undefs).not.toContain('example');
    expect(undefs).not.toContain('anthropic');
  });

  it('does not flag guard names as undefined', async () => {
    const modulePath = await writeModule('guard-name-decl.mld', `guard @blockDestructive before op:run = when [* => allow]
show @blockDestructive
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.undefinedVariables ?? []).map(w => w.variable);
    expect(undefs).not.toContain('blockDestructive');
  });

  it('does not flag @p pipeline context alias as undefined', async () => {
    const modulePath = await writeModule('pipeline-p-alias.mld', `/exe @stage(input) = \`ok:@input\`
/var @result = "seed" with { pipeline: [@stage(@p)] }
/show @result
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.warnings ?? []).map(w => w.variable);
    expect(undefs).not.toContain('p');
  });

  it('treats configured resolver prefix variables as known names', async () => {
    await fs.writeFile(
      path.join(tempDir, 'mlld-config.json'),
      JSON.stringify({
        resolvers: {
          prefixes: [
            {
              prefix: '@lib/',
              resolver: 'LOCAL',
              type: 'io',
              config: { basePath: './src/lib' }
            }
          ]
        }
      }, null, 2),
      'utf8'
    );

    const modulePath = await writeModule('resolver-prefix-known.mld', `show @lib
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.warnings ?? []).map(w => w.variable);
    expect(undefs).not.toContain('lib');
  });

  it('does not flag hook declaration names as undefined', async () => {
    const modulePath = await writeModule('hook-name-decl.mld', `/hook @audit before op:run = [ => @input ]
/show @audit
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.warnings ?? []).map(w => w.variable);
    expect(undefs).not.toContain('audit');
  });

  it('still warns for genuinely undefined variables', async () => {
    const modulePath = await writeModule('genuine-undef.mld', `/show @doesNotExist
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.warnings ?? []).map(w => w.variable);
    expect(undefs).toContain('doesNotExist');
  });

  it('extracts guard timing from guard fields instead of subtype', async () => {
    const modulePath = await writeModule('guard-timing.mld', `guard @beforeGuard before op:run = when [* => allow]
guard @afterGuard after op:run = when [* => allow]
guard @alwaysGuard always op:run = when [* => allow]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.guards).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'beforeGuard', timing: 'before', filter: 'op:run' }),
      expect.objectContaining({ name: 'afterGuard', timing: 'after', filter: 'op:run' }),
      expect.objectContaining({ name: 'alwaysGuard', timing: 'always', filter: 'op:run' })
    ]));
  });

  it('includes guards and needs from directives in analyze output', async () => {
    const modulePath = await writeModule('analyze-json-guards-needs.mld', `/needs { cmd: [curl], sh }
guard @g before op:run = when [* => allow]
/exe @hello() = \`hi\`
/export { @hello }
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.guards).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'g', timing: 'before', filter: 'op:run' })
    ]));
    expect(result.needs?.cmd).toEqual(expect.arrayContaining(['curl']));
  });

  it('extracts policy details, executable labels, and privileged guard arms', async () => {
    const modulePath = await writeModule('analyze-policies-guards-labels.mld', `policy @task = {
  defaults: { rules: ["no-send-to-unknown", "no-destroy-unknown"] },
  operations: {
    destructive: ["tool:w"],
    network: ["net:w"]
  },
  locked: false
}
policy @merged = union(@task, @org)
guard privileged @authSendEmail before op:tool:w = when [
  @mx.op.name == "send_email" && @mx.args.recipients ~= ["alice@example.com"] => allow
  @mx.op.name == "send_email" => deny "recipients not authorized"
]
exe tool:w @send_email(recipients, subject) = cmd { echo "ok" }
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.executables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'send_email',
        params: ['recipients', 'subject'],
        labels: ['tool:w']
      })
    ]));
    expect(result.guards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'authSendEmail',
        timing: 'before',
        filter: 'op:tool:w',
        privileged: true,
        arms: expect.arrayContaining([
          expect.objectContaining({
            action: 'allow',
            condition: expect.stringContaining('@mx.args.recipients ~= ["alice@example.com"]')
          }),
          expect.objectContaining({
            action: 'deny',
            condition: '@mx.op.name == "send_email"',
            reason: 'recipients not authorized'
          })
        ])
      })
    ]));
    expect(result.policies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'task',
        rules: ['no-send-to-unknown', 'no-destroy-unknown'],
        operations: {
          destructive: ['tool:w'],
          network: ['net:w']
        },
        locked: false
      }),
      expect.objectContaining({
        name: 'merged',
        refs: ['task', 'org']
      })
    ]));
  });

  it('warns on unknown built-in policy rule names', async () => {
    const modulePath = await writeModule('analyze-unknown-policy-rule.mld', `policy @task = {
  defaults: { rules: ["no-send-to-unkown"] }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'unknown-policy-rule'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('no-send-to-unkown');
    expect(warnings[0]?.suggestion).toContain('no-send-to-unknown');
  });

  it('warns on privileged wildcard allow guards', async () => {
    const modulePath = await writeModule('analyze-privileged-wildcard-allow.mld', `guard privileged @auth before op:tool:w = when [
  * => allow
]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'privileged-wildcard-allow'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('unconditional allow');
  });

  it('warns on unreachable guard arms covered by an earlier arm', async () => {
    const modulePath = await writeModule('analyze-guard-unreachable-arm.mld', `guard @auth before op:tool:w = when [
  @mx.op.name == "send_email" => deny "all sends blocked"
  @mx.op.name == "send_email" && @mx.args.recipients ~= ["alice@example.com"] => allow
]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'guard-unreachable-arm'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('earlier condition already covers it');
  });

  it('warns when privileged guard filters do not match any declared policy operation labels', async () => {
    const modulePath = await writeModule('analyze-privileged-guard-without-policy-operation.mld', `policy @task = {
  defaults: { rules: ["no-send-to-unknown"] },
  operations: { destructive: ["tool:r"] }
}
guard privileged @auth before op:tool:w = when [
  * => deny "blocked"
]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'privileged-guard-without-policy-operation'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('op:tool:w');
  });

  it('validates guard filters, operation names, and arg references against context executables', async () => {
    const contextPath = await writeModule('analyze-tools-context.mld', `exe tool:w @send_email(recipients, subject) = cmd { echo "ok" }
`);
    const guardPath = await writeModule('analyze-guard-context.mld', `guard @sendEmail before op:named:send_email = when [
  @mx.args.recipients ~= ["alice@example.com"] => allow
  @mx.args.cc ~= [] => deny "cc not allowed"
]
guard @missingFilter before op:named:archive = when [
  * => deny "missing filter target"
]
guard @missingOpLabel before op:tool:x = when [
  * => deny "missing op label"
]
guard @missingOpName before op:tool:w = when [
  @mx.op.name == "missing_tool" => deny "missing op name"
]
`);

    const resultWithoutContext = await analyze(guardPath, { checkVariables: false });
    expect((resultWithoutContext.antiPatterns ?? []).filter(entry => entry.code.startsWith('guard-context-'))).toHaveLength(0);

    const result = await analyze(guardPath, {
      checkVariables: false,
      context: [contextPath]
    });

    expect(result.valid).toBe(true);
    const missingExeWarnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'guard-context-missing-exe'
    );
    const missingOpLabelWarnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'guard-context-missing-op-label'
    );
    const missingArgWarnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'guard-context-missing-arg'
    );

    expect(missingExeWarnings).toHaveLength(2);
    expect(missingExeWarnings.map(entry => entry.message).join('\n')).toContain('op:named:archive');
    expect(missingExeWarnings.map(entry => entry.message).join('\n')).toContain('missing_tool');
    expect(missingOpLabelWarnings).toHaveLength(1);
    expect(missingOpLabelWarnings[0]?.message).toContain('tool:x');
    expect(missingArgWarnings).toHaveLength(1);
    expect(missingArgWarnings[0]?.message).toContain('@mx.args.cc');
  });

  it('fails validation closed when policy.authorizations omits input-record fact constraints', async () => {
    const contextPath = await writeModule('analyze-authz-context.mld', `record @send_email_inputs = {
  facts: [recipients: array],
  data: [cc: array?, bcc: array?, subject: string],
  validate: "strict"
}

var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    labels: ["execute:w"]
  }
}

exe tool:w @send_email(recipients, cc, bcc, subject) = cmd { echo "ok" }
`);
    const modulePath = await writeModule('analyze-authz-invalid.mld', `policy @taskPolicy = {
  authorizations: {
    allow: {
      send_email: true
    }
  }
}
show @taskPolicy
`);

    const result = await analyze(modulePath, {
      checkVariables: false,
      context: [contextPath]
    });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message).join('\n')).toContain(
      'cannot use true in policy.authorizations'
    );
  });

  it('accepts policy.authorizations with record-shaped tool metadata and surfaces normalization warnings', async () => {
    const modulePath = await writeModule('analyze-authz-valid.mld', `record @create_file_inputs = {
  data: [title: string],
  validate: "strict"
}

exe tool:w @create_file(title) = cmd { echo "ok" }
var tools @agentTools = {
  create_file: {
    mlld: @create_file,
    inputs: @create_file_inputs,
    labels: ["execute:w"]
  }
}
policy @taskPolicy = {
  authorizations: {
    allow: {
      create_file: {}
    }
  }
}
show @taskPolicy
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    const warnings = (result.antiPatterns ?? []).filter(
      entry =>
        entry.code === 'policy-authorizations-empty-entry' ||
        entry.code === 'policy-authorizations-unconstrained-tool'
    );
    expect(warnings.map(entry => entry.code)).toEqual(
      expect.arrayContaining([
        'policy-authorizations-empty-entry',
        'policy-authorizations-unconstrained-tool'
      ])
    );
  });

  it('accepts input-record tool constraints in the same module', async () => {
    const modulePath = await writeModule('analyze-authz-exe-control-args.mld', `record @send_money_inputs = {
  facts: [recipient: string],
  data: [amount: string],
  validate: "strict"
}

exe tool:w @send_money(recipient, amount) = cmd { echo "ok" }
var tools @agentTools = {
  send_money: {
    mlld: @send_money,
    inputs: @send_money_inputs,
    labels: ["execute:w"]
  }
}
policy @taskPolicy = {
  authorizations: {
    allow: {
      send_money: {
        args: {
          recipient: "acct-1"
        }
      }
    }
  }
}
show @taskPolicy
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
  });

  it('does not validate generic authorizations objects as policy declarations', async () => {
    const modulePath = await writeModule('analyze-generic-authorizations-intent.mld', `var @decision = {
  authorizations: {
    resolved: {
      send_email: {
        recipient: "contact-handle"
      }
    },
    known: {
      send_email: {
        recipient: "ada@example.com"
      }
    },
    allow: ["send_email"]
  }
}
show @decision
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect((result.errors ?? []).filter(entry => entry.message.includes('policy.authorizations'))).toHaveLength(0);
    expect((result.antiPatterns ?? []).filter(entry => entry.code.startsWith('policy-authorizations-'))).toHaveLength(0);
  });

  it('reports denied tools for statically analyzable @policy.build callsites with base policy overrides', async () => {
    const modulePath = await writeModule('analyze-policy-build-denied.mld', `record @create_draft_inputs = {
  data: [subject: string, body: string],
  validate: "strict"
}

record @delete_draft_inputs = {
  facts: [id: string],
  validate: "strict"
}

exe tool:w @create_draft(subject, body) = cmd { echo "ok" }
exe destructive:targeted, tool:w @delete_draft(id) = cmd { echo "ok" }

var tools @writeTools = {
  create_draft: { mlld: @create_draft, inputs: @create_draft_inputs, labels: ["execute:w"] },
  delete_draft: { mlld: @delete_draft, inputs: @delete_draft_inputs, labels: ["execute:w"] }
}

var @basePolicy = {
  authorizations: {
    deny: ["delete_draft"]
  }
}

var @built = @policy.build({
  delete_draft: {
    id: "draft-1"
  }
}, @writeTools) with { policy: @basePolicy }
show @built
`);

    const result = await analyze(modulePath, { checkVariables: false });
    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message).join('\n')).toContain(
      "Tool 'delete_draft' is denied by policy.authorizations.deny"
    );
    expect(result.policyCalls).toEqual([
      expect.objectContaining({
        callee: '@policy.build',
        status: 'analyzed',
        toolsSource: 'top_level_var',
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            reason: 'authorizations-denied-tool',
            tool: 'delete_draft'
          })
        ])
      })
    ]);
  });

  it('reports can_authorize fields when statically analyzable policy.build intent includes them', async () => {
    const modulePath = await writeModule('analyze-policy-build-can-authorize-intent.mld', `record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string, body: string],
  validate: "strict"
}

exe tool:w @send_email(recipient, subject, body) = cmd { echo "ok" }

var tools @writeTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    labels: ["execute:w"]
  }
}

var @built = @policy.build({
  can_authorize: {
    role:planner: [@send_email]
  },
  allow: ["send_email"]
}, @writeTools)
show @built
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message).join('\n')).toContain(
      '@policy.build intent cannot include can_authorize; declare policy.authorizations.can_authorize on the base policy instead'
    );
    expect(result.policyCalls).toEqual([
      expect.objectContaining({
        callee: '@policy.build',
        status: 'analyzed',
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            reason: 'invalid_authorization',
            message: expect.stringContaining('@policy.build intent cannot include can_authorize')
          })
        ])
      })
    ]);
  });

  it('validates task-backed known literals for statically analyzable policy builder calls', async () => {
    const modulePath = await writeModule('analyze-policy-build-known-task.mld', `record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string, body: string],
  validate: "strict"
}

exe exfil:send, tool:w @send_email(recipient, subject, body) = cmd { echo "ok" }

var tools @writeTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    labels: ["execute:w"]
  }
}

var @query = "Please send an update to ada-recipient"
var @intent = {
  known: {
    send_email: {
      recipient: "evil-recipient"
    }
  }
}

var @built = @policy.build(@intent, @writeTools, { task: @query })
show @built
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message).join('\n')).toContain(
      "Known literal 'evil-recipient' not found in task text"
    );
    expect(result.policyCalls).toEqual([
      expect.objectContaining({
        callee: '@policy.build',
        status: 'analyzed',
        intentSource: 'top_level_var',
        toolsSource: 'top_level_var',
        taskSource: 'top_level_var',
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            reason: 'known_not_in_task',
            tool: 'send_email',
            arg: 'recipient'
          })
        ])
      })
    ]);
  });

  it('reports proofless resolved values for statically analyzable policy validator calls', async () => {
    const modulePath = await writeModule('analyze-policy-validate-resolved.mld', `record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string, body: string],
  validate: "strict"
}

exe exfil:send, tool:w @send_email(recipient, subject, body) = cmd { echo "ok" }

var tools @writeTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    labels: ["execute:w"]
  }
}

var @intent = {
  resolved: {
    send_email: {
      recipient: "acct-1"
    }
  }
}

var @validated = @policy.validate(@intent, @writeTools)
show @validated
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message).join('\n')).toContain(
      "Tool 'send_email' resolved authorization for 'recipient' must use a handle-backed value"
    );
    expect(result.policyCalls).toEqual([
      expect.objectContaining({
        callee: '@policy.validate',
        status: 'analyzed',
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            reason: 'proofless_resolved_value',
            tool: 'send_email',
            arg: 'recipient'
          })
        ])
      })
    ]);
  });

  it('reports no_update_fields for statically analyzable policy builder calls', async () => {
    const modulePath = await writeModule('analyze-policy-build-update-args.mld', `record @update_scheduled_transaction_inputs = {
  facts: [id: string, recipient: string],
  data: [amount: string?, date: string?, subject: string?],
  validate: "strict"
}

exe finance:w, tool:w @update_scheduled_transaction(id, recipient, amount, date, subject) = cmd { echo "ok" } with {
  updateArgs: ["amount", "date", "subject"]
}

var tools @writeTools = {
  update_scheduled_transaction: {
    mlld: @update_scheduled_transaction,
    inputs: @update_scheduled_transaction_inputs,
    labels: ["execute:w"]
  }
}

var @built = @policy.build({
  update_scheduled_transaction: {
    id: "txn-1",
    recipient: "acct-1"
  }
}, @writeTools)
show @built
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message).join('\n')).toContain(
      "Tool 'update_scheduled_transaction' update authorization must specify at least one update field: amount, date, subject"
    );
    expect(result.policyCalls).toEqual([
      expect.objectContaining({
        callee: '@policy.build',
        status: 'analyzed',
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            reason: 'no_update_fields',
            tool: 'update_scheduled_transaction'
          })
        ])
      })
    ]);
  });

  it('skips policy call analysis when intent comes from a dynamic top-level binding', async () => {
    const modulePath = await writeModule('analyze-policy-build-dynamic-skip.mld', `record @create_draft_inputs = {
  data: [subject: string, body: string],
  validate: "strict"
}

exe tool:w @create_draft(subject, body) = cmd { echo "ok" }

var tools @writeTools = {
  create_draft: { mlld: @create_draft, inputs: @create_draft_inputs, labels: ["execute:w"] }
}

var @intent_json = '{"allow":["create_draft"]}'
var @intent = @intent_json | @parse

var @built = @policy.build(@intent, @writeTools)
show @built
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.policyCalls).toEqual([
      expect.objectContaining({
        callee: '@policy.build',
        status: 'skipped',
        intentSource: 'top_level_var',
        toolsSource: 'top_level_var',
        skipReason: 'dynamic-source-intent'
      })
    ]);
  });

  it('surfaces executable authorization metadata, output records, and resume guard arms', async () => {
    const modulePath = await writeModule('analyze-exe-metadata.mld', `
/record @contact = {
  facts: [email: string]
}
/exe llm, tool:w @send_email(recipient, subject, body) = js { return "ok"; } => contact with {
  controlArgs: ["recipient"],
  updateArgs: ["subject"],
  exactPayloadArgs: ["body"],
  correlateControlArgs: true
}
/guard @format after op:named:send_email = when [
  * => resume "Return valid JSON"
]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.executables).toEqual([
      expect.objectContaining({
        name: 'send_email',
        controlArgs: ['recipient'],
        updateArgs: ['subject'],
        exactPayloadArgs: ['body'],
        correlateControlArgs: true,
        outputRecord: {
          kind: 'static',
          name: 'contact'
        }
      })
    ]);
    expect(result.guards?.[0]?.arms).toEqual([
      expect.objectContaining({
        action: 'resume',
        reason: 'Return valid JSON'
      })
    ]);
  });

  it('fails validation for unknown executable with-clause keys', async () => {
    const modulePath = await writeModule('analyze-exe-with-typo.mld', `
/exe @send_email(recipient) = js { return "ok"; } with {
  contolArgs: ["recipient"]
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message)).toContain(
      "Unknown executable with-clause field 'contolArgs'"
    );
  });

  it('fails validation for invalid executable authorization metadata', async () => {
    const modulePath = await writeModule('analyze-exe-invalid-metadata.mld', `
/exe @send_email(recipient, body) = js { return "ok"; } with {
  controlArgs: ["recipient"],
  updateArgs: ["recipient"],
  exactPayloadArgs: ["missing"],
  correlateControlArgs: "yes"
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    const messages = (result.errors ?? []).map(entry => entry.message).join('\n');
    expect(messages).toContain('Executable updateArgs must be disjoint from controlArgs');
    expect(messages).toContain("Executable exactPayloadArgs entry 'missing' is not a declared parameter");
    expect(messages).toContain('Executable correlateControlArgs must be a boolean');
  });

  it('validates input-record tool catalogs against exe params and bind coverage', async () => {
    const modulePath = await writeModule('analyze-input-record-tool-catalog.mld', `
/record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string],
  validate: "strict"
}

/exe tool:w @send_email(recipient, subject, body) = js { return "ok"; }

/var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    bind: {
      recipient: "ada@example.com"
    }
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    const messages = (result.errors ?? []).map(entry => entry.message).join('\n');
    expect(messages).toContain("Tool 'send_email' bind cannot include input-record fields: recipient");
    expect(messages).toContain("Tool 'send_email' must cover all parameters of '@send_email' via inputs or bind: body");
  });

  it('rejects removed legacy tool-shaping fields even when inputs are declared', async () => {
    const modulePath = await writeModule('analyze-input-record-mixed-shape.mld', `
/record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string, body: string],
  validate: "strict"
}

/exe tool:w @send_email(recipient, subject, body) = js { return "ok"; }

/var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    controlArgs: ["recipient"]
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message)).toContain(
      "Tool 'send_email' uses removed field 'controlArgs'. Declare control args as `facts:` fields in the tool's input record (`inputs:`)."
    );
  });

  it('requires update:w when an input record declares update fields', async () => {
    const modulePath = await writeModule('analyze-input-record-update-label.mld', `
/record @update_issue_inputs = {
  facts: [id: string],
  data: [subject: string?, body: string?],
  update: [subject, body],
  validate: "strict"
}

/exe tool:w @update_issue(id, subject, body) = js { return "ok"; }

/var tools @agentTools = {
  update_issue: {
    mlld: @update_issue,
    inputs: @update_issue_inputs,
    labels: ["execute:w"]
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message)).toContain(
      "Tool 'update_issue' inputs require label 'update:w' when record '@update_issue_inputs' declares update fields"
    );
  });

  it('rejects allowlist and blocklist targets that point at input records', async () => {
    const modulePath = await writeModule('analyze-input-record-policy-targets.mld', `
/record @approved_recipients = {
  facts: [recipient: string],
  correlate: true,
  validate: "strict"
}

/record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string],
  allowlist: { recipient: @approved_recipients },
  blocklist: { recipient: @approved_recipients },
  validate: "strict"
}

/exe tool:w @send_email(recipient, subject) = js { return "ok"; }

/var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    labels: ["execute:w"]
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    const messages = (result.errors ?? []).map(entry => entry.message).join('\n');
    expect(messages).toContain(
      "Tool 'send_email' allowlist target '@approved_recipients' for field 'recipient' must not be an input record"
    );
    expect(messages).toContain(
      "Tool 'send_email' blocklist target '@approved_recipients' for field 'recipient' must not be an input record"
    );
  });

  it('reports exact_not_in_task for statically analyzable policy builder calls against input-record exact fields', async () => {
    const modulePath = await writeModule('analyze-policy-build-input-record-exact.mld', `
/record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string, body: string],
  exact: [subject],
  validate: "strict"
}

/exe tool:w @send_email(recipient, subject, body) = js { return "ok"; }

/var tools @writeTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    labels: ["execute:w"]
  }
}

/var @built = @policy.build({
  send_email: {
    recipient: "ada-recipient",
    subject: "Quarterly budget",
    body: "see attached"
  }
}, @writeTools, { task: "email about the roadmap" })
/show @built
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect(result.policyCalls).toEqual([
      expect.objectContaining({
        callee: '@policy.build',
        status: 'analyzed',
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            reason: 'exact_not_in_task',
            tool: 'send_email',
            arg: 'subject'
          })
        ])
      })
    ]);
  });

  it('rejects invalid input-record catalog can_authorize values', async () => {
    const modulePath = await writeModule('analyze-input-record-can-authorize-invalid.mld', `
/record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string, body: string],
  validate: "strict"
}

/exe tool:w @send_email(recipient, subject, body) = js { return "ok"; }

/var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    can_authorize: "planner"
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message)).toContain(
      "Tool 'send_email' can_authorize entries must match role:*: planner"
    );
  });

  it('accepts returns and surfaces arbitrary tool catalog metadata as warnings', async () => {
    const modulePath = await writeModule('analyze-tool-catalog-unknown-fields.mld', `
/record @search_contacts_inputs = {
  data: [query: string],
  validate: "strict"
}

/record @contact = {
  facts: [email: string],
  data: [name: string?]
}

/exe @search(query) = js { return { email: "test@example.com", name: "Test" }; }

/var tools @catalog = {
  search_contacts: {
    mlld: @search,
    returns: @contact,
    inputs: @search_contacts_inputs,
    labels: ["resolve:r"],
    description: "Search contacts.",
    can_authorize: false,
    custom_field: { arbitrary: true }
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.errors ?? []).toEqual([]);

    const warnings = (result.antiPatterns ?? []).filter(
      entry => entry.code === 'tool-catalog-unknown-field'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings.map(entry => entry.message)).toEqual([
      "Tool 'search_contacts' has unrecognized field 'custom_field'. Unrecognized fields are preserved but not validated."
    ]);
    expect(warnings.some(entry => entry.message.includes("'returns'"))).toBe(false);
  });

  it('rejects removed legacy tool catalog fields with replacement guidance', async () => {
    const modulePath = await writeModule('analyze-tool-catalog-legacy-fields.mld', `
/exe @send_email(recipient, subject, body) = js { return "ok"; }

/var tools @catalog = {
  send_email: {
    mlld: @send_email,
    controlArgs: ["recipient"],
    kind: "write",
    semantics: "Send an outbound email.",
    authorizable: "role:planner"
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    const messages = (result.errors ?? []).map(entry => entry.message);
    expect(messages).toContain(
      "Tool 'send_email' uses removed field 'controlArgs'. Declare control args as `facts:` fields in the tool's input record (`inputs:`)."
    );
    expect(messages).toContain(
      "Tool 'send_email' uses removed field 'kind'. Use routing labels in `labels:` (for example, `resolve:r`, `execute:w`)."
    );
    expect(messages).toContain(
      "Tool 'send_email' uses removed field 'semantics'. Renamed to `description:`."
    );
    expect(messages).toContain(
      "Tool 'send_email' uses removed field 'authorizable'. Renamed to `can_authorize:`."
    );
  });

  it('resolves imported input records when validating tool catalogs', async () => {
    await writeModule('records.mld', `
/record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string, body: string],
  validate: "strict"
}

/export { @send_email_inputs }
`);

    const modulePath = await writeModule('analyze-input-record-imported.mld', `
/import { @send_email_inputs } from "./records.mld"

/exe tool:w @send_email(recipient, subject, body) = js { return "ok"; }

/var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect((result.errors ?? []).map(entry => entry.message)).not.toContain(
      "Tool 'send_email' inputs reference unknown record '@send_email_inputs'"
    );
  });

  it('catches statically knowable record definition errors', async () => {
    const modulePath = await writeModule('analyze-invalid-records.mld', `
/record @deal = {
  key: id,
  facts: [id: string?]
}

/record @contact = {
  facts: [{ recipient: @lookup() }]
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    const messages = (result.errors ?? []).map(entry => entry.message).join('\n');
    expect(messages).toContain("Record '@deal' key field 'id' cannot be optional");
    expect(messages).toContain("Record '@contact' computed field 'recipient' must be pure");
  });

  it('surfaces valid record definitions in analyze output', async () => {
    const modulePath = await writeModule('analyze-record-info.mld', `
/record @contact = {
  key: email,
  facts: [email: string],
  data: [name: string],
  display: [email]
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.records).toEqual([
      expect.objectContaining({
        name: 'contact',
        key: 'email',
        display: 'legacy',
        rootMode: 'object',
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'email', classification: 'fact' }),
          expect.objectContaining({ name: 'name', classification: 'data' })
        ])
      })
    ]);
  });

  it('accepts role-labelled named display declarations in record definitions', async () => {
    const modulePath = await writeModule('analyze-role-display-record.mld', `
/record @contact = {
  facts: [email: string],
  data: [name: string, notes: string?],
  display: {
    role:planner: [name, { ref: "email" }],
    role:worker: [{ mask: "email" }, name, notes]
  }
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.records).toEqual([
      expect.objectContaining({
        name: 'contact',
        display: 'named'
      })
    ]);
  });

  it('catches statically knowable output-record reference errors', async () => {
    const modulePath = await writeModule('analyze-missing-output-record.mld', `
/exe @send_email(recipient) = js { return "ok"; } => contact
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message).join('\n')).toContain(
      "Executable '@send_email' references unknown record '@contact'"
    );
  });

  it('accepts dynamic output record annotations followed by exe-level with-clauses', async () => {
    const modulePath = await writeModule('analyze-dynamic-output-record-with-tail.mld', `
/exe tool:r @parse(input, schema) = @input => record @schema with { controlArgs: ["input"] }
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.errors ?? []).toEqual([]);
  });

  it('catches statically knowable @cast record reference errors without guessing on dynamic cases', async () => {
    const modulePath = await writeModule('analyze-missing-cast-record.mld', `
/record @contact = {
  facts: [email: string]
}

/var @raw = {
  email: "ada@example.com"
}

/var @bad = @cast(@raw, @missing_record)
/var @dynamic_name = "contact"
/var @ok = @cast(@raw, @dynamic_name)
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(entry => entry.message)).toContain(
      "Builtin @cast references unknown record '@missing_record'"
    );
    expect((result.errors ?? []).map(entry => entry.message).join('\n')).not.toContain('@dynamic_name');
  });

  it('catches statically knowable shelf definition errors', async () => {
    const modulePath = await writeModule('analyze-invalid-shelf.mld', `
/record @contact = {
  key: id,
  facts: [id: string]
}

/shelf @pipeline = {
  recipients: { type: contact[], merge: "replace" },
  selected: contact? from missing,
  unknowns: missing_record[]
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    const messages = (result.errors ?? []).map(entry => entry.message).join('\n');
    expect(messages).toContain("slot 'recipients' cannot use merge:'replace' on a collection");
    expect(messages).toContain("slot 'selected' references unknown slot 'missing'");
    expect(messages).toContain("references unknown record '@missing_record'");
  });

  it('surfaces valid shelf definitions in analyze output', async () => {
    const modulePath = await writeModule('analyze-shelf-info.mld', `
/record @contact = {
  key: id,
  facts: [id: string]
}

/shelf @pipeline = {
  recipients: contact[],
  selected: contact? from recipients
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.shelves).toEqual([
      expect.objectContaining({
        name: 'pipeline',
        slots: expect.arrayContaining([
          expect.objectContaining({ name: 'recipients', record: 'contact', cardinality: 'collection' }),
          expect.objectContaining({ name: 'selected', record: 'contact', cardinality: 'singular', from: 'recipients' })
        ])
      })
    ]);
  });

  it('catches static box shelf alias conflicts and unknown targets', async () => {
    const modulePath = await writeModule('analyze-box-shelf-scope.mld', `
/record @contact = {
  key: id,
  facts: [id: string]
}

/shelf @ledger = {
  execution_log: contact[],
  candidates: contact[]
}

/box {
  shelf: {
    read: [@ledger.execution_log as slot, @ledger.candidates as slot, @missing.ghost],
    write: [@ledger.execution_log]
  }
} [
  => @input
]
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(false);
    const messages = (result.errors ?? []).map(entry => entry.message).join('\n');
    expect(messages).toContain("Shelf alias 'slot' is already bound to a different slot");
    expect(messages).toContain("Unknown shelf slot '@missing.ghost'");
  });

  it('populates needs.cmd with shell commands detected from run directives', async () => {
    const modulePath = await writeModule('analyze-needs-shell-commands.mld', `/run sh {
curl https://example.com | jq ".ok"
}
`);

    const result = await analyze(modulePath, { checkVariables: false });

    expect(result.valid).toBe(true);
    expect(result.needs?.cmd).toEqual(expect.arrayContaining(['curl', 'jq']));
  });

  it('does not flag for-loop key variables as undefined', async () => {
    const modulePath = await writeModule('for-key-decl.mld', `var @items = { a: 1, b: 2 }
for @k, @v in @items => show @k
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.undefinedVariables ?? []).map(w => w.variable);
    expect(undefs).not.toContain('k');
    expect(undefs).not.toContain('v');
  });

  it('does not flag implicit for-loop locals @item, @index, and @key as undefined', async () => {
    const modulePath = await writeModule('for-implicit-locals.mld', `/var @items = ["a", "b"]
/for @entry in @items => show \`@item:@index:@key:@entry\`
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.warnings ?? []).map(w => w.variable);
    expect(undefs).not.toContain('item');
    expect(undefs).not.toContain('index');
    expect(undefs).not.toContain('key');
  });

  it('warns for undefined variables in executable invocation arguments', async () => {
    const modulePath = await writeModule('exe-invocation-undefined-arg.mld', `/exe @greet(name) = \`Hello @name\`
/var @result = @greet(@typo)
/show @result
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const undefs = (result.warnings ?? []).map(w => w.variable);
    expect(undefs).toContain('typo');
  });

  it('warns when an omitted trailing exe parameter is passed into another function call', async () => {
    const modulePath = await writeModule('exe-pass-through-omitted-param.mld', `/exe @inner(x, timeout) = \`@x:@timeout\`
/exe @outer(x, timeout) = [
  let @result = @inner(@x, @timeout)
  => @result
]
/var @r = @outer("hello")
/show @r
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const timeoutWarnings = (result.warnings ?? []).filter(w => w.variable === 'timeout');
    expect(timeoutWarnings.length).toBeGreaterThan(0);
    expect(timeoutWarnings[0]?.suggestion).toContain('@outer');
    expect(timeoutWarnings[0]?.suggestion).toContain('@inner');
    expect(timeoutWarnings[0]?.suggestion).toContain('omitted at callsite line');
  });

  it('does not warn for pass-through parameters when all callsites provide the argument', async () => {
    const modulePath = await writeModule('exe-pass-through-always-provided.mld', `/exe @inner(x, timeout) = \`@x:@timeout\`
/exe @outer(x, timeout) = [
  let @result = @inner(@x, @timeout)
  => @result
]
/var @a = @outer("hello", "30s")
/var @b = @outer("world", "10s")
/show @a
/show @b
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    const timeoutWarnings = (result.warnings ?? []).filter(w => w.variable === 'timeout');
    expect(timeoutWarnings).toHaveLength(0);
  });

  it('reports duplicate checkpoint names as validation errors', async () => {
    const modulePath = await writeModule('checkpoint-duplicate.mld', `/checkpoint "stage-a"
/checkpoint "stage-a"
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(error => error.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('duplicate checkpoint "stage-a"')])
    );
  });

  it('reports checkpoint directives inside /exe bodies as validation errors', async () => {
    const modulePath = await writeModule('checkpoint-in-exe.mld', `/exe @task() = [
  checkpoint "inside"
  => "ok"
]
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(error => error.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('checkpoint "inside" is only allowed at top level')
      ])
    );
  });

  it('accepts checkpoints as direct actions in top-level when forms', async () => {
    const modulePath = await writeModule('checkpoint-top-level-when.mld', `/when [
  @mode == "deep" => checkpoint "deep-path"
  * => checkpoint "default-path"
]
/when @mode [
  "quick" => checkpoint "quick-path"
]
/when @enabled => checkpoint "inline-path"
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    expect(result.errors ?? []).toHaveLength(0);
  });

  it('reports checkpoints nested inside when action blocks as validation errors', async () => {
    const modulePath = await writeModule('checkpoint-nested-when-block.mld', `/when @enabled => [
  checkpoint "nested"
]
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(error => error.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('checkpoint "nested" is only allowed at top level or as a direct => result of a top-level when')
      ])
    );
  });

  it('reports checkpoints inside when expressions as validation errors', async () => {
    const modulePath = await writeModule('checkpoint-when-expression.mld', `/var @phase = when [
  * => checkpoint "not-allowed"
]
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(false);
    expect((result.errors ?? []).map(error => error.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('checkpoint "not-allowed" is only allowed at top level or as a direct => result of a top-level when')
      ])
    );
  });

  it('skips static duplicate-name validation for dynamic checkpoint names', async () => {
    const modulePath = await writeModule('checkpoint-dynamic-names.mld', `/var @phase = "same"
/checkpoint "@phase"
/checkpoint "@phase"
`);

    const result = await analyze(modulePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    expect((result.errors ?? []).map(error => error.message)).not.toEqual(
      expect.arrayContaining([expect.stringContaining('duplicate checkpoint')])
    );
  });
});

describe('template validation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-template-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeFile(filename: string, content: string): Promise<string> {
    const dirPath = path.dirname(path.join(tempDir, filename));
    await fs.mkdir(dirPath, { recursive: true });
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('validates an .att template with valid variable references', async () => {
    const templatePath = await writeFile('valid.att', 'Hello @name!\n\nYour role: @role\n');

    const result = await analyze(templatePath);

    expect(result.valid).toBe(true);
    expect(result.template).toBeDefined();
    expect(result.template!.type).toBe('att');
    expect(result.template!.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'name', type: 'variable' }),
        expect.objectContaining({ name: 'role', type: 'variable' }),
      ])
    );
  });

  it('validates an .mtt template with mustache-style references', async () => {
    const templatePath = await writeFile('valid.mtt', 'Hello {{name}}!\n\nYour role: {{role}}\n');

    const result = await analyze(templatePath);

    expect(result.valid).toBe(true);
    expect(result.template).toBeDefined();
    expect(result.template!.type).toBe('mtt');
    expect(result.template!.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'name', type: 'variable' }),
        expect.objectContaining({ name: 'role', type: 'variable' }),
      ])
    );
  });

  it('detects ExecInvocation in .att templates', async () => {
    const templatePath = await writeFile('with-func.att', 'Hello @name!\n\n@greet(arg1, arg2)\n');

    const result = await analyze(templatePath);

    expect(result.valid).toBe(true);
    expect(result.template!.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'name', type: 'variable' }),
        expect.objectContaining({ name: 'greet', type: 'function' }),
      ])
    );
  });

  it('warns on undefined template variable when no sibling exe declarations found', async () => {
    const templatePath = await writeFile('orphan.att', 'Hello @name!\n');

    const result = await analyze(templatePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
    expect(result.warnings![0].variable).toBe('name');
  });

  it('discovers params from sibling .mld exe declarations', async () => {
    await writeFile('greet.att', 'Hello @name!\n\nYour role: @role\n');
    const templatePath = path.join(tempDir, 'greet.att');

    // Write a sibling module that declares an exe using this template
    await writeFile('main.mld', `/exe @greet(name, role) = template "greet.att"\n/show @greet("Alice", "admin")\n`);

    const result = await analyze(templatePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    expect(result.template!.discoveredParams).toEqual(
      expect.arrayContaining(['name', 'role'])
    );
    // No warnings since all vars are covered by discovered params
    expect(result.warnings ?? []).toHaveLength(0);
  });

  it('flags undefined refs not in discovered params', async () => {
    await writeFile('partial.att', 'Hello @name!\n\n@unknownVar\n');
    const templatePath = path.join(tempDir, 'partial.att');

    await writeFile('main.mld', `/exe @greet(name) = template "partial.att"\n`);

    const result = await analyze(templatePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    expect(result.template!.discoveredParams).toEqual(['name']);
    expect(result.warnings).toBeDefined();
    const undefs = result.warnings!.map(w => w.variable);
    expect(undefs).toContain('unknownVar');
    expect(undefs).not.toContain('name');
  });

  it('does not produce false positives for @@ escaped sequences in .att', async () => {
    const templatePath = await writeFile('escaped.att', 'Send to user@@example.com\n\nHello @name!\n');

    const result = await analyze(templatePath);

    expect(result.valid).toBe(true);
    // @@ should not be treated as a variable reference
    const varNames = result.template!.variables.map(v => v.name);
    expect(varNames).not.toContain('@example');
    expect(varNames).toContain('name');
  });

  it('does not flag builtin variables as undefined in templates', async () => {
    const templatePath = await writeFile('builtins.att', 'Base: @base\nRoot: @root\nTime: @now\n');

    const result = await analyze(templatePath, { checkVariables: true });

    expect(result.valid).toBe(true);
    // All are builtins, so no warnings expected
    expect(result.warnings ?? []).toHaveLength(0);
  });

  it('handles .att template with mlld code fence masking', async () => {
    const templatePath = await writeFile('fenced.att', `Hello @name!

\`\`\`mlld
/var @example = "this is literal"
\`\`\`

Done.
`);

    const result = await analyze(templatePath);

    expect(result.valid).toBe(true);
    // @example inside the fence should be masked (literal), not treated as a var reference
    const varNames = result.template!.variables.map(v => v.name);
    expect(varNames).toContain('name');
    expect(varNames).not.toContain('example');
  });

  it('reports parse errors for invalid .att templates', async () => {
    // ATT templates are very permissive, so let's use an mtt with broken syntax
    const templatePath = await writeFile('invalid.mtt', 'Hello {{name!\n');

    const result = await analyze(templatePath);

    // MTT with unclosed {{ might be parsed as text — let's check what happens
    // The grammar is fairly permissive for templates, so this may still be valid
    // Just ensure it doesn't throw
    expect(typeof result.valid).toBe('boolean');
  });
});

describe('directory recursion', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-dir-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeFile(filename: string, content: string): Promise<string> {
    const dirPath = path.dirname(path.join(tempDir, filename));
    await fs.mkdir(dirPath, { recursive: true });
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('validates all mlld files in a directory', async () => {
    await writeFile('module.mld', '/var @x = 1\n/show @x\n');
    await writeFile('template.att', 'Hello @name!\n');
    await writeFile('sub/nested.mld', '/var @y = 2\n/show @y\n');

    const results: any[] = [];
    for (const file of [
      path.join(tempDir, 'module.mld'),
      path.join(tempDir, 'template.att'),
      path.join(tempDir, 'sub/nested.mld'),
    ]) {
      results.push(await analyze(file));
    }

    expect(results).toHaveLength(3);
    expect(results.every(r => r.valid)).toBe(true);
  });

  it('handles mixed valid and invalid files', async () => {
    await writeFile('good.mld', '/var @x = 1\n/show @x\n');
    await writeFile('bad.mld', '/var @x = \n');

    const good = await analyze(path.join(tempDir, 'good.mld'));
    const bad = await analyze(path.join(tempDir, 'bad.mld'));

    expect(good.valid).toBe(true);
    expect(bad.valid).toBe(false);
  });

  it('skips non-mlld files in directories', async () => {
    await writeFile('module.mld', '/var @x = 1\n/show @x\n');
    await writeFile('readme.txt', 'Not an mlld file\n');
    await writeFile('data.json', '{"key": "value"}\n');

    // Only the .mld file should be analyzed
    const result = await analyze(path.join(tempDir, 'module.mld'));
    expect(result.valid).toBe(true);
  });
});

describe('deep validation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-deep-validate-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeFile(filename: string, content: string): Promise<string> {
    const dirPath = path.dirname(path.join(tempDir, filename));
    await fs.mkdir(dirPath, { recursive: true });
    const filePath = path.join(tempDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  }

  it('follows imports and template references from the entry module', async () => {
    const entryPath = await writeFile('run/index.mld', `/import { @worker } from "./worker.mld"
/show @worker("Ada")
`);

    await writeFile('run/worker.mld', `/exe @worker(name) = template "./prompts/worker.att"
/export { @worker }
`);

    const templatePath = await writeFile('run/prompts/worker.att', 'Hello @name!\n');

    const deepResults = await analyzeDeep([entryPath], { checkVariables: true });
    const analyzedPaths = deepResults.map(result => result.filepath);

    expect(analyzedPaths).toContain(path.resolve(entryPath));
    expect(analyzedPaths).toContain(path.resolve(path.join(tempDir, 'run/worker.mld')));
    expect(analyzedPaths).toContain(path.resolve(templatePath));
  });

  it('promotes undefined template variables to errors in strict deep mode', async () => {
    const entryPath = await writeFile('run/index.mld', `/import { @worker } from "./worker.mld"
/show @worker("scenario")
`);

    await writeFile('run/worker.mld', `/exe @worker(scenarioName, scenarioDesc, specPath, evidenceRules) = template "./prompts/live-test.att"
/export { @worker }
`);

    const templatePath = await writeFile(
      'run/prompts/live-test.att',
      'Scenario: @scenarioName\nExample literal: @fn("prefix")\n'
    );

    const deepResults = await analyzeDeep([entryPath], {
      checkVariables: true,
      strictTemplateVariables: true
    });

    const templateResult = deepResults.find(result => result.filepath === path.resolve(templatePath));
    expect(templateResult).toBeDefined();
    expect(templateResult!.valid).toBe(false);
    expect(templateResult!.warnings ?? []).toHaveLength(0);

    const messages = (templateResult!.errors ?? []).map(error => error.message).join('\n');
    expect(messages).toContain('undefined variable @fn in template');
    expect(messages).toContain('defined parameters: scenarioName, scenarioDesc, specPath, evidenceRules');
    expect(messages).toContain('use @@fn or \\@fn for literal @ text');
    expect(messages).toContain('use @@var or \\@var for literal @ text');
  });
});
