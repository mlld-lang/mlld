import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import type { Environment } from '@interpreter/env/Environment';
import { interpret } from '@interpreter/index';
import { accessField } from '@interpreter/utils/field-access';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pythonAvailable = (() => {
  try {
    execSync('python - <<\"PY\"\nprint(\"ok\")\nPY', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const fakeServerPath = fileURLToPath(
  new URL('../../../tests/support/mcp/fake-server.cjs', import.meta.url)
);
const pathService = new PathService();
const pathContext = {
  projectRoot: '/',
  fileDirectory: '/',
  executionDirectory: '/',
  invocationDirectory: '/',
  filePath: '/module.mld.md'
};

function buildRoundTripSource(options: {
  fetchExpression: string;
  preludeLines?: string[];
}): string {
  return [
    '/record @contact = {',
    '  key: id,',
    '  facts: [email: string, id: string],',
    '  data: [name: string]',
    '}',
    '/shelf @s = {',
    '  selected: contact?',
    '}',
    ...(options.preludeLines ?? []),
    `/var @found = ${options.fetchExpression}`,
    '@shelf.write(@s.selected, @found.0)',
    '/var @readBack = @shelf.read(@s.selected)'
  ].join('\n');
}

async function readEmailField(
  env: Environment,
  variableName: string,
  options: { array?: boolean } = {}
) {
  const value = env.getVariable(variableName)?.value;
  expect(value, `expected @${variableName} to be defined`).toBeDefined();

  const record = options.array === true
    ? await accessField(value, { type: 'arrayIndex', value: 0 } as any, { env })
    : value;
  return accessField(record, { type: 'field', value: 'email' } as any, { env });
}

async function expectFactBearingRoundTrip(source: string, fileSystem = new MemoryFileSystem()) {
  let environment: Environment | undefined;

  try {
    await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      format: 'markdown',
      captureEnvironment: env => {
        environment = env;
      }
    });

    expect(environment).toBeDefined();
    const beforeEmail = await readEmailField(environment!, 'found', { array: true });
    const afterEmail = await readEmailField(environment!, 'readBack');
    const beforeFactsources = (beforeEmail as any).mx?.factsources;
    const afterFactsources = (afterEmail as any).mx?.factsources;

    expect((beforeEmail as any).mx?.labels).toEqual(
      expect.arrayContaining(['fact:@contact.email'])
    );
    expect(beforeFactsources).toEqual([
      expect.objectContaining({
        ref: '@contact.email',
        sourceRef: '@contact',
        field: 'email',
        instanceKey: 'c1',
        position: 0,
        coercionId: expect.any(String)
      })
    ]);
    expect(beforeFactsources?.[0]?.coercionId).toMatch(UUID_RE);
    expect(afterFactsources).toEqual(beforeFactsources);
  } finally {
    environment?.cleanup();
  }
}

describe('record coercion path coverage', () => {
  it('preserves factsources for js exe output coercion', async () => {
    await expectFactBearingRoundTrip(
      buildRoundTripSource({
        preludeLines: [
          '/exe @fetch() = js {',
          '  return [{ email: "alice@example.com", id: "c1", name: "Alice" }];',
          '} => contact'
        ],
        fetchExpression: '@fetch()'
      })
    );
  });

  it('preserves factsources for cmd exe output coercion', async () => {
    await expectFactBearingRoundTrip(
      buildRoundTripSource({
        preludeLines: [
          `/exe @fetch() = cmd { printf '%s' '[{"email":"alice@example.com","id":"c1","name":"Alice"}]' } => contact`
        ],
        fetchExpression: '@fetch()'
      })
    );
  });

  it('preserves factsources for sh exe output coercion', async () => {
    await expectFactBearingRoundTrip(
      buildRoundTripSource({
        preludeLines: [
          `/exe @fetch() = sh { printf '%s' '[{"email":"alice@example.com","id":"c1","name":"Alice"}]' } => contact`
        ],
        fetchExpression: '@fetch()'
      })
    );
  });

  it('preserves factsources for node exe output coercion', async () => {
    await expectFactBearingRoundTrip(
      buildRoundTripSource({
        preludeLines: [
          '/exe @fetch() = node {',
          '  return [{ email: "alice@example.com", id: "c1", name: "Alice" }];',
          '} => contact'
        ],
        fetchExpression: '@fetch()'
      })
    );
  });

  const pyIt = pythonAvailable ? it : it.skip;
  pyIt('preserves factsources for py exe output coercion', async () => {
    await expectFactBearingRoundTrip(
      buildRoundTripSource({
        preludeLines: [
          '/exe @fetch() = py {',
          'import json',
          'print(json.dumps([{ "email": "alice@example.com", "id": "c1", "name": "Alice" }]))',
          '} => contact'
        ],
        fetchExpression: '@fetch()'
      })
    );
  });

  it('preserves factsources for inline as-record coercion', async () => {
    await expectFactBearingRoundTrip(
      buildRoundTripSource({
        fetchExpression: '[{ email: "alice@example.com", id: "c1", name: "Alice" }] as record @contact'
      })
    );
  });

  it('preserves factsources for imported MCP wrapper exe coercion', async () => {
    const fileSystem = new MemoryFileSystem();
    const serverSpec = `${process.execPath} ${fakeServerPath}`;

    await fileSystem.writeFile('/contacts_tools.mld', [
      '/record @contact = {',
      '  key: id,',
      '  facts: [email: string, id: string],',
      '  data: [name: string]',
      '}',
      `/import tools from mcp "${serverSpec}" as @mcp`,
      '/exe tool:r @lookup_contact() = @mcp.echo("[{\\"email\\":\\"alice@example.com\\",\\"id\\":\\"c1\\",\\"name\\":\\"Alice\\"}]") => contact',
      '/export { @lookup_contact }'
    ].join('\n'));

    await expectFactBearingRoundTrip(
      buildRoundTripSource({
        preludeLines: ['/import { @lookup_contact } from "/contacts_tools.mld"'],
        fetchExpression: '@lookup_contact()'
      }),
      fileSystem
    );
  });
});
