import { RegistryManager } from '@core/registry';
import * as path from 'path';

export async function registryCommand(args: string[]): Promise<void> {
  const subcommand = args[0];
  const manager = new RegistryManager(process.cwd());

  switch (subcommand) {
    case 'install':
      await manager.installFromLock();
      break;
      
    case 'update':
      await manager.updateModule(args[1]);
      break;
      
    case 'audit':
      await manager.audit();
      break;
      
    case 'search':
      if (!args[1]) {
        console.error('Usage: mlld registry search <query>');
        process.exit(1);
      }
      await manager.search(args[1]);
      break;
      
    case 'search-servers':
      if (!args[1]) {
        console.error('Usage: mlld registry search-servers <query>');
        process.exit(1);
      }
      await manager.searchServers(args[1]);
      break;
      
    case 'info':
      if (!args[1]) {
        console.error('Usage: mlld registry info <module>');
        process.exit(1);
      }
      await manager.info(args[1]);
      break;
      
    case 'stats':
      if (args[1] === 'share') {
        console.log('Stats sharing not yet implemented');
        // await manager.shareStats();
      } else {
        await manager.showStats();
      }
      break;
      
    case 'outdated':
      console.log('Checking for outdated modules...');
      // This would need to be implemented in RegistryManager
      console.log('Not yet implemented');
      break;
      
    default:
      console.log(`
mlld registry - Manage mlld module registry

Commands:
  install              Install all modules from lock file
  update [module]      Update module(s) to latest version
  audit                Check for security advisories
  search <query>       Search for mlld modules
  search-servers <q>   Search for MCP servers
  info <module>        Show module details
  stats                Show local usage statistics
  stats share          Share anonymous usage statistics
  outdated             Show outdated modules

Examples:
  mlld registry search json
  mlld registry search-servers github
  mlld registry info adamavenir/json-utils
  mlld registry update
  mlld registry audit
`);
  }
}