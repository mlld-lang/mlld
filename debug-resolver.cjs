const { Environment } = require('./dist/interpreter/env/Environment.js');
const { NodeFileSystem } = require('./dist/services/fs/NodeFileSystem.js');
const { PathService } = require('./dist/services/fs/PathService.js');

async function debug() {
  try {
    const env = new Environment(
      new NodeFileSystem(),
      new PathService(),
      process.cwd()
    );

    console.log('Environment created');
    console.log('Resolver manager exists:', !!env.resolverManager);

    if (env.resolverManager) {
      const registries = env.resolverManager.getRegistries();
      console.log('Registries count:', registries.length);
      console.log('Registries:', registries);
    } else {
      console.log('No resolver manager found');
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

debug();