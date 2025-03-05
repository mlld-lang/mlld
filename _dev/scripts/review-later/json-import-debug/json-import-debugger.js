#!/usr/bin/env node

/**
 * Custom debug script for testing JSON import functionality
 * 
 * Key features:
 * - Custom ImportDirectiveHandler with JSON support
 * - Direct service registration without full DI container
 * - Manual state event tracking for debugging
 */

// Add reflect-metadata polyfill required by tsyringe
require('reflect-metadata');

// Import the DI container and services
const { container } = require('tsyringe');
const { 
  ResolutionService, 
  CircularityService, 
  DirectiveService, 
  FileSystemService, 
  InterpreterService, 
  OutputService, 
  ParserService, 
  PathOperationsService, 
  PathService, 
  StateService,
  ValidationService
} = require('./dist/index.cjs');

// Import the CLI module directly 
const cli = require('./dist/cli.cjs');

// Import fs-extra for NodeFileSystem functionality
const fs = require('fs-extra');
const { Stats } = require('fs');
const { promisify } = require('util');
const { exec } = require('child_process');
const { watch } = require('fs/promises');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Set up the environment for debugging
process.env.DEBUG = 'true';
process.env.MELD_DEBUG = '1';
process.env.NODE_ENV = 'development';

// Create a simple NodeFileSystem class
class NodeFileSystem {
  readFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
  }

  writeFile(filePath, content) {
    fs.writeFileSync(filePath, content, 'utf8');
  }

  exists(filePath) {
    return fs.existsSync(filePath);
  }

  stat(path) {
    return fs.statSync(path);
  }

  readDir(path) {
    return fs.readdirSync(path);
  }

  mkdir(path, recursive = true) {
    return fs.mkdirSync(path, { recursive });
  }

  isDirectory(path) {
    try {
      return fs.statSync(path).isDirectory();
    } catch (e) {
      return false;
    }
  }

  isFile(path) {
    try {
      return fs.statSync(path).isFile();
    } catch (e) {
      return false;
    }
  }

  watch(filePath, callback) {
    return fs.watch(filePath, callback);
  }

  executeCommand(command, options) {
    return execSync(command, options).toString();
  }

  getCwd() {
    return process.cwd();
  }

  dirname(filePath) {
    return path.dirname(filePath);
  }
}

// Create a minimal StateEventService implementation
class StateEventService {
  constructor() {
    this.subscribers = new Map();
  }

  subscribe(eventName, callback) {
    if (!this.subscribers.has(eventName)) {
      this.subscribers.set(eventName, []);
    }
    this.subscribers.get(eventName).push(callback);
    return () => this.unsubscribe(eventName, callback);
  }

  unsubscribe(eventName, callback) {
    if (!this.subscribers.has(eventName)) return;
    const callbacks = this.subscribers.get(eventName);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(eventName, data) {
    if (!this.subscribers.has(eventName)) return;
    for (const callback of this.subscribers.get(eventName)) {
      callback(data);
    }
  }
}

// Create a custom ImportDirectiveHandler that can handle JSON files
class CustomImportDirectiveHandler {
  constructor(stateService, pathService, fileSystemService) {
    this.stateService = stateService;
    this.pathService = pathService;
    this.fileSystemService = fileSystemService;
    this.kind = 'import';
  }

  async execute(node, context) {
    try {
      console.log('Custom import handler executing for node:', JSON.stringify(node, null, 2));
      
      if (!node.directive.path) {
        throw new Error('Import directive requires a path');
      }

      console.log('Resolving path:', JSON.stringify(node.directive.path, null, 2));
      
      // Resolve the path
      const resolvedPath = await this.pathService.resolvePath(node.directive.path, context.state);
      console.log('Full resolved path object:', JSON.stringify(resolvedPath, null, 2));
      
      // Only throw an error if resolvedPath is null or undefined
      if (!resolvedPath) {
        throw new Error(`Failed to resolve path: ${node.directive.path.raw}`);
      }
      
      // Check if resolvedPath is a string or an object with resolvedPath property
      const fullPath = typeof resolvedPath === 'string' ? resolvedPath : resolvedPath.resolvedPath;
      console.log('Using resolved path:', fullPath);
      
      // Check if the file exists
      const fileExists = await this.fileSystemService.exists(fullPath);
      console.log('File exists check result:', fileExists);
      
      if (!fileExists) {
        throw new Error(`Import file not found: ${fullPath}`);
      }
      
      // Read the file content
      const content = await this.fileSystemService.readFile(fullPath, 'utf8');
      console.log('File content read, length:', content.length);
      
      // If it's a JSON file, parse it and import the properties
      if (fullPath.endsWith('.json')) {
        try {
          console.log('Parsing JSON file');
          const jsonData = JSON.parse(content);
          
          // If specific imports are defined, import only those properties
          if (node.directive.imports && node.directive.imports.length > 0) {
            console.log('Importing specific properties from JSON');
            for (const importItem of node.directive.imports) {
              if (importItem.name) {
                const value = jsonData[importItem.name];
                if (value !== undefined) {
                  console.log(`Importing ${importItem.name} with value:`, value);
                  context.state.setDataVar(importItem.name, value);
                } else {
                  console.log(`Warning: Property ${importItem.name} not found in JSON`);
                }
              }
            }
          } else {
            // Import all properties from the JSON
            console.log('Importing all properties from JSON');
            for (const [key, value] of Object.entries(jsonData)) {
              console.log(`Importing ${key} with value:`, value);
              context.state.setDataVar(key, value);
            }
          }
          
          console.log('JSON import completed successfully');
        } catch (jsonError) {
          console.error('Error parsing JSON:', jsonError);
          throw new Error(`Failed to parse JSON file: ${jsonError.message}`);
        }
      } else {
        // For non-JSON files, delegate to standard import process
        console.log('Non-JSON file detected, delegating to standard import process');
        // This is a placeholder - in a real implementation, you would handle non-JSON imports here
        throw new Error('Non-JSON imports not implemented in this custom handler');
      }
      
      // Return the updated state
      return context.state;
    } catch (error) {
      console.error('Error in custom import handler:', error);
      throw error;
    }
  }
}

/**
 * Register services with the DI container
 */
function registerServices() {
  // Create service instances directly
  const nodeFileSystem = new NodeFileSystem();
  const stateEventService = new StateEventService();
  const stateService = new StateService(stateEventService);
  const validationService = new ValidationService();
  const pathService = new PathService();
  const parserService = new ParserService();
  const circularityService = new CircularityService(stateService);
  
  // Create resolution service with its dependencies
  const resolutionService = new ResolutionService(
    stateService,
    nodeFileSystem,
    parserService,
    pathService
  );
  
  // Create directive service
  const directiveService = new DirectiveService();
  
  // Create interpreter service
  const interpreterService = new InterpreterService();
  
  // Initialize services in the correct order
  pathService.initialize();
  stateService.setDataVar('debug', true);
  
  // Initialize directive service with all required dependencies
  directiveService.initialize(
    validationService,
    stateService,
    pathService,
    nodeFileSystem,
    parserService,
    interpreterService,
    circularityService,
    resolutionService
  );
  
  // Initialize interpreter service with its dependencies
  interpreterService.initialize(directiveService, stateService);
  
  // Register custom import handler for JSON files
  directiveService.registerHandler(
    new CustomImportDirectiveHandler(
      stateService,
      pathService,
      nodeFileSystem
    )
  );
  
  return {
    nodeFileSystem,
    stateService,
    validationService,
    pathService,
    parserService,
    circularityService,
    resolutionService,
    directiveService,
    interpreterService
  };
}

// Command: debug-transform
yargs(hideBin(process.argv))
  .scriptName('debug-cli')
  .usage('$0 <cmd> [args]')
  .command('debug-transform <file>', 'Debug transformations for a file', (yargs) => {
    yargs.positional('file', {
      describe: 'File to transform',
      type: 'string'
    });
  }, async (argv) => {
    console.log(`Debugging transformations for file: ${argv.file}`);
    
    try {
      // Register services
      const services = registerServices();
      
      // Resolve the file path
      const filePath = path.resolve(process.cwd(), argv.file);
      console.log(`Resolved file path: ${filePath}`);
      
      // Read the file content
      const contentToTransform = fs.readFileSync(filePath, 'utf8');
      
      // Set debug mode in the state service
      services.stateService.setDataVar('debug', true);
      
      // Parse the content into nodes
      const nodes = await services.parserService.parse(contentToTransform);
      console.log(`Parsed ${nodes.length} nodes from file`);
      
      // Set the current file path in the state service
      services.stateService.setDataVar('currentFilePath', filePath);
      
      // Interpret the nodes
      await services.interpreterService.interpret(nodes, { filePath });
      
      console.log('Transformation completed successfully');
    } catch (error) {
      console.error('Error during transformation:', error);
      process.exit(1);
    }
  })
  .help()
  .parse();