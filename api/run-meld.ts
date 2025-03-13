/**
 * Simple API for processing meld content directly
 */
import { createDefaultServices } from './index.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';
import { ProcessOptions } from '@core/types/index.js';
import { validateServicePipeline } from '@core/utils/serviceValidation.js';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem.js';
import { resolveService } from '@core/ServiceProvider';

// Import service factory types
import { PathServiceClientFactory } from '@services/fs/PathService/factories/PathServiceClientFactory.js';
import { FileSystemServiceClientFactory } from '@services/fs/FileSystemService/factories/FileSystemServiceClientFactory.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory.js';
import { StateServiceClientFactory } from '@services/state/StateService/factories/StateServiceClientFactory.js';
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';

// Export the MemoryFileSystem for users who want to use it
export { MemoryFileSystem };

/**
 * Process meld content directly from a string
 *
 * @param content - The meld content to process
 * @param options - Optional processing options
 * @returns Processed content as a string
 *
 * @example
 * ```typescript
 * import { runMeld } from 'meld';
 *
 * const meldContent = `
 *   @text greeting = "Hello"
 *   @text name = "World"
 *
 *   ${greeting}, ${name}!
 * `;
 *
 * const result = await runMeld(meldContent);
 * console.log(result); // "Hello, World!"
 * ```
 */
export async function runMeld(
  content: string,
  options: Partial<ProcessOptions> = {}
): Promise<string> {
  // Create a virtual file path
  const virtualFilePath = '/virtual-file.mld';

  // Create an in-memory file system
  const memoryFS = new MemoryFileSystem();
  
  // Store the content in the virtual file
  await memoryFS.writeFile(virtualFilePath, content);
  
  // Default options
  const defaultOptions: ProcessOptions = {
    format: 'markdown',
    transformation: true,
    fs: memoryFS
  };
  
  // Merge options
  const mergedOptions: ProcessOptions = { ...defaultOptions, ...options };
  
  // Always use the memory filesystem
  mergedOptions.fs = memoryFS;
  
  // Create services
  const services = createDefaultServices(mergedOptions);
  
  // Enable test mode on PathService to allow absolute paths in memory filesystem
  services.path.setTestMode(true);
  
  // Validate services
  validateServicePipeline(services);

  // Try to get factories from the container
  let pathClientFactory: PathServiceClientFactory | undefined;
  let fileSystemClientFactory: FileSystemServiceClientFactory | undefined;
  let parserClientFactory: ParserServiceClientFactory | undefined;
  let resolutionClientFactory: ResolutionServiceClientFactory | undefined;
  let stateClientFactory: StateServiceClientFactory | undefined;
  let stateTrackingClientFactory: StateTrackingServiceClientFactory | undefined;
  
  try {
    // Get factories from the container with proper type assertions
    pathClientFactory = resolveService<PathServiceClientFactory>('PathServiceClientFactory');
    fileSystemClientFactory = resolveService<FileSystemServiceClientFactory>('FileSystemServiceClientFactory');
    parserClientFactory = resolveService<ParserServiceClientFactory>('ParserServiceClientFactory');
    resolutionClientFactory = resolveService<ResolutionServiceClientFactory>('ResolutionServiceClientFactory');
    stateClientFactory = resolveService<StateServiceClientFactory>('StateServiceClientFactory');
    stateTrackingClientFactory = resolveService<StateTrackingServiceClientFactory>('StateTrackingServiceClientFactory');
    
    // Create clients and connect services
    if (services.filesystem && fileSystemClientFactory && pathClientFactory) {
      try {
        const pathClient = pathClientFactory.createClient();
        // Use type assertion for property assignment
        (services.filesystem as any)['pathClient'] = pathClient;
      } catch (error) {
        console.warn('Failed to create PathServiceClient for FileSystemService', error);
      }
    }
    
    if (services.path && pathClientFactory && fileSystemClientFactory) {
      try {
        const fileSystemClient = fileSystemClientFactory.createClient();
        // Use type assertion for property assignment
        (services.path as any)['fileSystemClient'] = fileSystemClient;
      } catch (error) {
        console.warn('Failed to create FileSystemServiceClient for PathService', error);
      }
    }
    
    if (services.parser && parserClientFactory && resolutionClientFactory) {
      try {
        const resolutionClient = resolutionClientFactory.createClient();
        // Use type assertion for property assignment
        (services.parser as any)['resolutionClient'] = resolutionClient;
      } catch (error) {
        console.warn('Failed to create ResolutionServiceClient for ParserService', error);
      }
    }
    
    if (services.resolution && resolutionClientFactory && parserClientFactory) {
      try {
        const parserClient = parserClientFactory.createClient();
        // Use type assertion for property assignment
        (services.resolution as any)['parserClient'] = parserClient;
      } catch (error) {
        console.warn('Failed to create ParserServiceClient for ResolutionService', error);
      }
    }
    
    if (services.state && stateClientFactory && stateTrackingClientFactory) {
      try {
        const stateTrackingClient = stateTrackingClientFactory.createClient();
        // Use type assertion for property assignment - renamed from stateTrackingClient to trackingClient
        (services.state as any)['trackingClient'] = stateTrackingClient;
      } catch (error) {
        console.warn('Failed to create StateTrackingServiceClient for StateService', error);
      }
    }
  } catch (error) {
    console.warn('Failed to resolve one or more service factories', error);
  }

  // Create a properly typed interpreter factory that wraps the interpreter service
  // We need to import the real factory and create an instance
  const interpreterFactory = new InterpreterServiceClientFactory();
  // Set our interpreter service directly in the factory
  interpreterFactory.setInterpreterServiceForTests(services.interpreter);

  // Re-initialize directive and interpreter services to ensure they have the correct dependencies
  services.directive.initialize(
    services.validation,
    services.state,
    services.path,
    services.filesystem,
    services.parser,
    interpreterFactory,
    services.circularity,
    services.resolution
  );

  // Re-initialize interpreter with directive
  services.interpreter.initialize(services.directive, services.state);

  try {
    // Read the file (from memory)
    const content = await services.filesystem.readFile(virtualFilePath);
    
    // Parse the content
    const ast = await services.parser.parse(content, virtualFilePath);
    
    // Enable transformation if requested
    if (mergedOptions.transformation) {
      // If transformation is a boolean, use the legacy all-or-nothing approach
      // If it's an object with options, use selective transformation
      services.state.enableTransformation(mergedOptions.transformation);
    }
    
    // Interpret the AST
    const resultState = await services.interpreter.interpret(ast, { 
      filePath: virtualFilePath, 
      initialState: services.state,
      strict: true
    });
    
    // Get nodes to process (transformed if transformation is enabled)
    const nodesToProcess = resultState.isTransformationEnabled() && resultState.getTransformedNodes()
      ? resultState.getTransformedNodes()
      : ast;
    
    // Make sure format is properly set (normalize 'md' to 'markdown', etc.)
    const outputFormat = normalizeFormat(mergedOptions.format || 'markdown');
    
    // Convert to desired format
    let converted = await services.output.convert(nodesToProcess, resultState, outputFormat);
    
    // Post-process the output in transformation mode
    if (resultState.isTransformationEnabled()) {
      // Fix newlines in variable output
      converted = converted
        // Replace multiple newlines with a single newline
        .replace(/\n{2,}/g, '\n')
        // Common pattern fixes from the main function
        .replace(/(\w+):\n(\w+)/g, '$1: $2')
        .replace(/(\w+),\n(\w+)/g, '$1, $2')
        .replace(/(\w+):\n{/g, '$1: {')
        .replace(/},\n(\w+):/g, '}, $1:');
    }
    
    return converted;
  } catch (error) {
    // Rethrow with a clearer message for API usage
    if (error instanceof Error) {
      throw new Error(`Error processing meld content: ${error.message}`);
    }
    // For non-Error objects, convert to string
    throw new Error(`Error processing meld content: ${String(error)}`);
  }
}

/**
 * Normalize format string to supported format
 */
function normalizeFormat(format: string): 'markdown' | 'xml' {
  // Normalize format aliases
  if (format === 'md') {
    return 'markdown';
  }
  
  if (format === 'llmxml') {
    return 'xml';
  }
  
  // Ensure 'xml' is properly handled
  if (format === 'xml') {
    return 'xml';
  }
  
  // Default to markdown for unsupported formats
  return 'markdown';
}

// Default export for ease of use
export default runMeld; 