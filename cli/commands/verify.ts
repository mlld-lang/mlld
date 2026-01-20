import { SignatureStore } from '@core/security/SignatureStore';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { getCommandContext } from '../utils/command-context';

export interface VerifyOptions {
  basePath?: string;
  vars?: string[];
}

function parseVarList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(name => (name.startsWith('@') ? name.slice(1) : name));
}

export async function verifyCommand(options: VerifyOptions = {}): Promise<void> {
  const envVars = process.env.MLLD_VERIFY_VARS || '';
  const names = options.vars && options.vars.length > 0 ? options.vars : parseVarList(envVars);

  if (names.length === 0) {
    console.error('MLLD_VERIFY_VARS is not set and no variables are provided.');
    process.exit(1);
  }

  const context = await getCommandContext({ startPath: options.basePath });
  const fileSystem = new NodeFileSystem();
  const store = new SignatureStore(fileSystem, context.projectRoot);

  const results = await Promise.all(
    names.map(async name => ({ name, result: await store.verify(name) }))
  );

  if (results.length === 1) {
    console.log(JSON.stringify(results[0].result, null, 2));
  } else {
    const payload = Object.fromEntries(results.map(entry => [entry.name, entry.result]));
    console.log(JSON.stringify(payload, null, 2));
  }

  if (results.some(entry => !entry.result.verified)) {
    process.exitCode = 1;
  }
}

export function createVerifyCommand() {
  return {
    name: 'verify',
    description: 'Verify signed variables from MLLD_VERIFY_VARS',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      const vars = args && args.length > 0 ? args : undefined;
      const basePath = flags['base-path'] || process.cwd();
      await verifyCommand({ basePath, vars });
    }
  };
}
