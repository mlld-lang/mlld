import { TestContext } from '../../tests/utils/TestContext.js';
import { main } from '../../api/index.js';
import type { ProcessOptions, Services } from '../../core/types/index.js';

/**
 * This script helps debug path resolution issues by tracing a path directive
 * through the Meld pipeline and displaying information about how it's processed.
 */
async function debugPathResolution(pathDirective: string, enableLogging: boolean = true) {
  console.log('====== PATH RESOLUTION DEBUGGER ======');
  console.log(`Debugging path directive: ${pathDirective}`);
  
  // Create a test context
  const context = new TestContext();
  await context.initialize();
  
  // Create a test file with the path directive
  const testContent = `
${pathDirective}

This is a reference to the path: $mypath
`;
  
  await context.writeFile('test.meld', testContent);
  
  // Enable verbose logging if requested
  if (enableLogging) {
    process.env.MELD_DEBUG = '1';
    process.env.MELD_DEBUG_LEVEL = 'trace';
    process.env.MELD_DEBUG_VARS = 'mypath,PROJECTPATH,HOMEPATH';
  }
  
  // Start debug session
  const sessionId = await context.startDebugSession({
    captureConfig: {
      capturePoints: ['pre-transform', 'post-transform', 'error'],
      includeFields: ['variables', 'nodes', 'transformedNodes'],
    },
    visualization: {
      format: 'mermaid',
      includeMetadata: true
    }
  });
  
  try {
    // Process the file
    console.log('\n[STEP 1] Processing file with the path directive...');
    
    // Enable transformation
    context.enableTransformation({
      variables: true,
      directives: true,
      commands: true,
      imports: true
    });
    
    const result = await main('test.meld', {
      fs: context.fs,
      services: context.services as unknown as Partial<Services>,
      transformation: true
    });
    
    console.log('\n[STEP 2] Results:');
    console.log('Output:', result);
    
    // Get special path variables
    const projectPath = context.services.state.getPathVar('PROJECTPATH');
    const homePath = context.services.state.getPathVar('HOMEPATH');
    
    console.log('\n[STEP 3] Path Variable State:');
    console.log('PROJECTPATH =', projectPath);
    console.log('HOMEPATH =', homePath);
    
    // Get the path variable we set
    const myPath = context.services.state.getPathVar('mypath');
    console.log('mypath =', myPath);
    
    // Get debug session results
    const debugResults = await context.endDebugSession(sessionId);
    
    console.log('\n[STEP 4] State Visualization:');
    const visualization = await context.visualizeState('mermaid');
    console.log(visualization);
    
    console.log('\n[STEP 5] Path Resolution Trace:');
    console.log(JSON.stringify(debugResults.pathResolution || {}, null, 2));
    
    return {
      result,
      myPath,
      projectPath,
      homePath,
      debugResults
    };
  } catch (error) {
    console.error('\n[ERROR] Path Resolution Failed:');
    console.error(error);
    
    // Get debug session results even in case of error
    const debugResults = await context.endDebugSession(sessionId);
    
    console.log('\n[STEP 4] State Visualization (Error State):');
    const visualization = await context.visualizeState('mermaid');
    console.log(visualization);
    
    throw error;
  } finally {
    await context.cleanup();
  }
}

// Test both formats
async function main() {
  console.log('\n\n======= Testing with $PROJECTPATH format =======\n');
  try {
    await debugPathResolution('@path mypath = "$PROJECTPATH/my/docs"');
  } catch (e) {
    console.error('$PROJECTPATH test failed:', e);
  }
  
  console.log('\n\n======= Testing with $. format =======\n');
  try {
    await debugPathResolution('@path mypath = "$./my/docs"');
  } catch (e) {
    console.error('$. test failed:', e);
  }
  
  console.log('\n\n======= Testing with $HOMEPATH format =======\n');
  try {
    await debugPathResolution('@path mypath = "$HOMEPATH/my/docs"');
  } catch (e) {
    console.error('$HOMEPATH test failed:', e);
  }
  
  console.log('\n\n======= Testing with $~ format =======\n');
  try {
    await debugPathResolution('@path mypath = "$~/my/docs"');
  } catch (e) {
    console.error('$~ test failed:', e);
  }
}

// Run the main function
main().catch(console.error); 