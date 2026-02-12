import { startLiveStdioServer } from './live-stdio-server';

export async function liveCommand(args: string[] = []): Promise<void> {
  const hasStdio = args.includes('--stdio');

  if (!hasStdio) {
    console.error('Usage: mlld live --stdio');
    console.error('The live command currently supports only --stdio transport.');
    process.exit(1);
  }

  await startLiveStdioServer();
}

export function createLiveCommand() {
  return {
    name: 'live',
    description: 'Start persistent live RPC server over stdio',

    async execute(args: string[], flags: Record<string, any> = {}): Promise<void> {
      if (flags.help || flags.h) {
        console.log(`
Usage: mlld live --stdio

Start a long-running NDJSON RPC server over stdio.

Protocol:
  Request:  {"method":"process|execute|analyze|cancel","id":1,"params":{...}}
  Event:    {"event":{"id":1,"type":"stream:chunk",...}}
  Result:   {"result":{"id":1,...}}

Notes:
  - process: Execute script text via params.script
  - execute: Run file via params.filepath + optional payload/state/dynamicModules
  - analyze: Static analysis via params.filepath
  - cancel: Abort active request by id

Examples:
  mlld live --stdio
        `);
        return;
      }

      const liveArgs = [...args];
      if (flags.stdio === true && !liveArgs.includes('--stdio')) {
        liveArgs.push('--stdio');
      }

      await liveCommand(liveArgs);
    }
  };
}
