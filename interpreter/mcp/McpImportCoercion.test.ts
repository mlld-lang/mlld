import { describe, expect, it, afterEach } from 'vitest';
import { McpImportManager } from '@interpreter/mcp/McpImportManager';
import { McpImportService } from '@interpreter/eval/import/McpImportService';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { fileURLToPath } from 'url';
import { deriveMcpParamInfo, buildMcpArgs, coerceMcpArgs } from '@interpreter/eval/import/McpImportResolver';
import type { MCPToolSchema } from '@interpreter/mcp/McpImportManager';

const fakeServerPath = fileURLToPath(
  new URL('../../tests/support/mcp/fake-server.cjs', import.meta.url)
);

function createEnvironment(): Environment {
  return new Environment(new NodeFileSystem(), new PathService(), '/');
}

function serverSpec(): string {
  return `${process.execPath} ${fakeServerPath}`;
}

describe('MCP arg type coercion (e2e)', () => {
  let manager: McpImportManager;

  afterEach(() => {
    manager?.closeAll();
  });

  it('coerces string to array for array-typed param', async () => {
    const env = createEnvironment();
    manager = new McpImportManager(env);
    const spec = serverSpec();

    const tools = await manager.listTools(spec);
    const createEvent = tools.find(t => t.name === 'create_event')!;
    expect(createEvent).toBeDefined();

    const paramInfo = deriveMcpParamInfo(createEvent);
    expect(paramInfo.paramTypes.participants).toBe('array');

    // Simulate what happens when LLM passes a string where array is expected
    const rawArgs = buildMcpArgs(paramInfo.paramNames, [{ title: 'Lunch', participants: 'alice@example.com' }]);
    const coerced = coerceMcpArgs(rawArgs, paramInfo.paramTypes);

    expect(coerced.participants).toEqual(['alice@example.com']);
    expect(coerced.title).toBe('Lunch');

    // Verify the MCP server receives the coerced array
    const result = await manager.callTool(spec, 'create_event', coerced);
    expect(result).toContain('participants=["alice@example.com"]');
    expect(result).toContain('title="Lunch"');
  });

  it('coerces string to integer for integer-typed param', async () => {
    const env = createEnvironment();
    manager = new McpImportManager(env);
    const spec = serverSpec();

    const tools = await manager.listTools(spec);
    const createEvent = tools.find(t => t.name === 'create_event')!;
    const paramInfo = deriveMcpParamInfo(createEvent);

    const rawArgs = buildMcpArgs(paramInfo.paramNames, [{
      title: 'Meeting', participants: ['bob'], count: '5'
    }]);
    const coerced = coerceMcpArgs(rawArgs, paramInfo.paramTypes);

    expect(coerced.count).toBe(5);
    expect(typeof coerced.count).toBe('number');

    const result = await manager.callTool(spec, 'create_event', coerced);
    expect(result).toContain('count=5');
  });

  it('coerces string to boolean for boolean-typed param', async () => {
    const env = createEnvironment();
    manager = new McpImportManager(env);
    const spec = serverSpec();

    const tools = await manager.listTools(spec);
    const createEvent = tools.find(t => t.name === 'create_event')!;
    const paramInfo = deriveMcpParamInfo(createEvent);

    const rawArgs = buildMcpArgs(paramInfo.paramNames, [{
      title: 'Offsite', participants: ['team'], all_day: 'true'
    }]);
    const coerced = coerceMcpArgs(rawArgs, paramInfo.paramTypes);

    expect(coerced.all_day).toBe(true);
    expect(typeof coerced.all_day).toBe('boolean');

    const result = await manager.callTool(spec, 'create_event', coerced);
    expect(result).toContain('all_day=true');
  });

  it('coerces multiple types in a single call via type_mirror', async () => {
    const env = createEnvironment();
    manager = new McpImportManager(env);
    const spec = serverSpec();

    const tools = await manager.listTools(spec);
    const mirror = tools.find(t => t.name === 'type_mirror')!;
    const paramInfo = deriveMcpParamInfo(mirror);

    const rawArgs = buildMcpArgs(paramInfo.paramNames, [{
      str_arg: 'hello',
      arr_arg: 'single',
      int_arg: '42',
      num_arg: '3.14',
      bool_arg: 'false'
    }]);
    const coerced = coerceMcpArgs(rawArgs, paramInfo.paramTypes);

    expect(coerced.str_arg).toBe('hello');
    expect(coerced.arr_arg).toEqual(['single']);
    expect(coerced.int_arg).toBe(42);
    expect(coerced.num_arg).toBeCloseTo(3.14);
    expect(coerced.bool_arg).toBe(false);

    const result = await manager.callTool(spec, 'type_mirror', coerced);
    expect(result).toContain('str_arg:string="hello"');
    expect(result).toContain('arr_arg:array=["single"]');
    expect(result).toContain('int_arg:number=42');
    expect(result).toContain('num_arg:number=3.14');
    expect(result).toContain('bool_arg:boolean=false');
  });

  it('leaves correctly-typed values unchanged', async () => {
    const env = createEnvironment();
    manager = new McpImportManager(env);
    const spec = serverSpec();

    const tools = await manager.listTools(spec);
    const mirror = tools.find(t => t.name === 'type_mirror')!;
    const paramInfo = deriveMcpParamInfo(mirror);

    const rawArgs = buildMcpArgs(paramInfo.paramNames, [{
      arr_arg: ['a', 'b'],
      int_arg: 7,
      bool_arg: true
    }]);
    const coerced = coerceMcpArgs(rawArgs, paramInfo.paramTypes);

    expect(coerced.arr_arg).toEqual(['a', 'b']);
    expect(coerced.int_arg).toBe(7);
    expect(coerced.bool_arg).toBe(true);

    const result = await manager.callTool(spec, 'type_mirror', coerced);
    expect(result).toContain('arr_arg:array=["a","b"]');
    expect(result).toContain('int_arg:number=7');
    expect(result).toContain('bool_arg:boolean=true');
  });
});

describe('MCP arg name matching (e2e via McpImportService)', () => {
  let manager: McpImportManager;

  afterEach(() => {
    manager?.closeAll();
  });

  it('creates tool variable with schema param names', async () => {
    const env = createEnvironment();
    manager = new McpImportManager(env);
    const spec = serverSpec();

    const tools = await manager.listTools(spec);
    const createEvent = tools.find(t => t.name === 'create_event')!;

    const service = new McpImportService(env);
    const variable = service.createMcpToolVariable({
      alias: 'createEvent',
      tool: createEvent,
      mcpName: 'create_event',
      importPath: spec
    });

    expect(variable.name).toBe('createEvent');
    expect(variable.internal?.mcpTool).toEqual({ name: 'create_event', source: spec });

    // The variable's param names come from the schema
    const paramInfo = deriveMcpParamInfo(createEvent);
    expect(paramInfo.paramNames).toContain('title');
    expect(paramInfo.paramNames).toContain('participants');
  });

  it('named object arg bypasses positional mapping', async () => {
    const env = createEnvironment();
    manager = new McpImportManager(env);
    const spec = serverSpec();

    const tools = await manager.listTools(spec);
    const createEvent = tools.find(t => t.name === 'create_event')!;

    const service = new McpImportService(env);
    const variable = service.createMcpToolVariable({
      alias: 'createEvent',
      tool: createEvent,
      mcpName: 'create_event',
      importPath: spec
    });

    // Call with named object — participants and title in "wrong" positional order
    // but correct by name. buildMcpArgs object passthrough handles this.
    const fn = variable.internal!.executableDef!.fn as (...args: unknown[]) => Promise<string>;
    const result = await fn({ participants: ['alice'], title: 'Lunch' });

    expect(result).toContain('title="Lunch"');
    expect(result).toContain('participants=["alice"]');
  });

  it('coercion applies through the tool variable fn', async () => {
    const env = createEnvironment();
    manager = new McpImportManager(env);
    const spec = serverSpec();

    const tools = await manager.listTools(spec);
    const createEvent = tools.find(t => t.name === 'create_event')!;

    const service = new McpImportService(env);
    const variable = service.createMcpToolVariable({
      alias: 'createEvent',
      tool: createEvent,
      mcpName: 'create_event',
      importPath: spec
    });

    // Pass string where array is expected — coercion should wrap it
    const fn = variable.internal!.executableDef!.fn as (...args: unknown[]) => Promise<string>;
    const result = await fn({ title: 'Lunch', participants: 'alice@example.com', count: '3', all_day: 'true' });

    expect(result).toContain('participants=["alice@example.com"]');
    expect(result).toContain('count=3');
    expect(result).toContain('all_day=true');
  });
});
