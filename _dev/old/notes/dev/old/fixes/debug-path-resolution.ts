/**
 * Debug script to check path resolution
 */

import { PathService } from '@services/fs/PathService/PathService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { StateService } from '@services/state/StateService/StateService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';

// The key issue here is a reference to stateService.getPathVar(), 
// but we've identified the issue might be in the path resolver.

// The error: "Cannot read properties of undefined (reading 'getPathVar')"
// This suggests that somewhere, we're calling getPathVar() on undefined

// In PathResolver.ts:
// Handle special path variables
// if (identifier === '~' || identifier === 'HOMEPATH') {
//   return this.stateService.getPathVar('HOMEPATH') || '';
// }

// Test this to see if it's the issue
async function testPathResolver() {
  // Set up services as they would be in the tests
  const pathOps = new PathOperationsService();
  const fs = new NodeFileSystem();
  const filesystem = new FileSystemService(pathOps, fs);
  
  const pathService = new PathService();
  pathService.initialize(filesystem);
  pathService.enableTestMode();
  pathService.setProjectPath('/project');
  pathService.setHomePath('/home/user');
  
  const state = new StateService();
  const parser = new ParserService();
  
  // Create resolution service
  const resolution = new ResolutionService(state, filesystem, parser);
  
  // Create resolution context
  const context = ResolutionContextFactory.forPathDirective('/test.meld');
  
  // Try resolving a path
  try {
    const result = await resolution.resolvePath('$PROJECTPATH/docs', context);
    console.log('Path resolved successfully:', result);
    return;
  } catch (error) {
    console.error('Path resolution failed:', error);
  }
}

// Run the test
testPathResolver();