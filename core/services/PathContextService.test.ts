import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { PathContextBuilder, PathContextService } from './PathContextService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('PathContextService', () => {
  let fileSystem: MemoryFileSystem;
  let service: PathContextService;
  
  beforeEach(async () => {
    fileSystem = new MemoryFileSystem();
    service = new PathContextService(fileSystem);
    
    // Set up a basic project structure
    await fileSystem.mkdir('/project');
    await fileSystem.writeFile('/project/mlld.lock.json', '{}');
    await fileSystem.mkdir('/project/src');
    await fileSystem.writeFile('/project/src/script.mld', '');
    await fileSystem.mkdir('/project/lib');
    await fileSystem.writeFile('/project/lib/utils.mld', '');
  });
  
  describe('PathContextBuilder', () => {
    describe('fromFile', () => {
      it('should build context from file path with project root', async () => {
        const context = await PathContextBuilder.fromFile(
          '/project/src/script.mld',
          fileSystem
        );
        
        expect(context.projectRoot).toBe('/project');
        expect(context.fileDirectory).toBe('/project/src');
        expect(context.filePath).toBe('/project/src/script.mld');
        expect(context.executionDirectory).toBe('/project/src');
        expect(context.invocationDirectory).toBe(process.cwd());
      });
      
      it('should handle nested directories', async () => {
        await fileSystem.mkdir('/project/src/nested');
        await fileSystem.writeFile('/project/src/nested/deep.mld', '');
        
        const context = await PathContextBuilder.fromFile(
          '/project/src/nested/deep.mld',
          fileSystem
        );
        
        expect(context.projectRoot).toBe('/project');
        expect(context.fileDirectory).toBe('/project/src/nested');
        expect(context.filePath).toBe('/project/src/nested/deep.mld');
      });
      
      it('should use file directory as project root if no mlld.lock.json', async () => {
        await fileSystem.mkdir('/standalone');
        await fileSystem.writeFile('/standalone/script.mld', '');
        
        const context = await PathContextBuilder.fromFile(
          '/standalone/script.mld',
          fileSystem
        );
        
        expect(context.projectRoot).toBe('/standalone');
        expect(context.fileDirectory).toBe('/standalone');
      });
      
      it('should respect option overrides', async () => {
        const context = await PathContextBuilder.fromFile(
          '/project/src/script.mld',
          fileSystem,
          {
            projectRoot: '/custom/root',
            executionDirectory: '/custom/exec',
            invocationDirectory: '/custom/invoke'
          }
        );
        
        expect(context.projectRoot).toBe('/custom/root');
        expect(context.executionDirectory).toBe('/custom/exec');
        expect(context.invocationDirectory).toBe('/custom/invoke');
      });
      
      it('should handle relative paths', async () => {
        // Mock process.cwd for this test
        const originalCwd = process.cwd;
        process.cwd = () => '/project';
        
        try {
          const context = await PathContextBuilder.fromFile(
            'src/script.mld',
            fileSystem
          );
          
          expect(context.filePath).toBe('/project/src/script.mld');
          expect(context.fileDirectory).toBe('/project/src');
        } finally {
          process.cwd = originalCwd;
        }
      });
    });
    
    describe('fromDefaults', () => {
      it('should create context with current directory', () => {
        const cwd = process.cwd();
        const context = PathContextBuilder.fromDefaults();
        
        expect(context.projectRoot).toBe(cwd);
        expect(context.fileDirectory).toBe(cwd);
        expect(context.executionDirectory).toBe(cwd);
        expect(context.invocationDirectory).toBe(cwd);
        expect(context.filePath).toBeUndefined();
      });
      
      it('should respect option overrides', () => {
        const context = PathContextBuilder.fromDefaults({
          projectRoot: '/custom/root',
          executionDirectory: '/custom/exec',
          invocationDirectory: '/custom/invoke'
        });
        
        expect(context.projectRoot).toBe('/custom/root');
        expect(context.executionDirectory).toBe('/custom/exec');
        expect(context.invocationDirectory).toBe('/custom/invoke');
      });
    });
    
    describe('forChildFile', () => {
      it('should create child context inheriting project root', async () => {
        const parentContext = await PathContextBuilder.fromFile(
          '/project/src/script.mld',
          fileSystem
        );
        
        const childContext = await PathContextBuilder.forChildFile(
          parentContext,
          '../lib/utils.mld',
          fileSystem
        );
        
        expect(childContext.projectRoot).toBe('/project'); // Inherited
        expect(childContext.fileDirectory).toBe('/project/lib');
        expect(childContext.filePath).toBe('/project/lib/utils.mld');
        expect(childContext.executionDirectory).toBe('/project/lib');
        expect(childContext.invocationDirectory).toBe(parentContext.invocationDirectory);
      });
      
      it('should handle absolute child paths', async () => {
        const parentContext = await PathContextBuilder.fromFile(
          '/project/src/script.mld',
          fileSystem
        );
        
        const childContext = await PathContextBuilder.forChildFile(
          parentContext,
          '/project/lib/utils.mld',
          fileSystem
        );
        
        expect(childContext.fileDirectory).toBe('/project/lib');
        expect(childContext.filePath).toBe('/project/lib/utils.mld');
      });
    });
  });
  
  describe('PathContextService', () => {
    describe('validate', () => {
      it('should validate a valid context', async () => {
        const context = await PathContextBuilder.fromFile(
          '/project/src/script.mld',
          fileSystem
        );
        
        const validation = await service.validate(context);
        
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
        expect(validation.warnings).toHaveLength(0);
      });
      
      it('should report errors for non-absolute paths', async () => {
        const context = {
          projectRoot: 'relative/path',
          fileDirectory: './src',
          executionDirectory: '../exec',
          invocationDirectory: 'invoke',
          filePath: 'file.mld'
        };
        
        const validation = await service.validate(context);
        
        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain('projectRoot must be an absolute path');
        expect(validation.errors).toContain('fileDirectory must be an absolute path');
        expect(validation.errors).toContain('executionDirectory must be an absolute path');
        expect(validation.errors).toContain('invocationDirectory must be an absolute path');
        expect(validation.errors).toContain('filePath must be an absolute path when provided');
      });
      
      it('should report errors for non-existent directories', async () => {
        const context = {
          projectRoot: '/project',
          fileDirectory: '/nonexistent',
          executionDirectory: '/project/src',
          invocationDirectory: process.cwd(),
          filePath: '/nonexistent/file.mld'
        };
        
        const validation = await service.validate(context);
        
        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain('fileDirectory does not exist: /nonexistent');
        expect(validation.errors).toContain('filePath does not exist: /nonexistent/file.mld');
      });
      
      it('should warn about missing mlld config files', async () => {
        await fileSystem.mkdir('/nolock');
        await fileSystem.writeFile('/nolock/script.mld', '');

        const context = await PathContextBuilder.fromFile(
          '/nolock/script.mld',
          fileSystem
        );

        const validation = await service.validate(context);

        expect(validation.valid).toBe(true);
        expect(validation.warnings).toContain('No mlld config files found in project root: /nolock');
      });
      
      it('should validate filePath is in fileDirectory', async () => {
        const context = {
          projectRoot: '/project',
          fileDirectory: '/project/src',
          executionDirectory: '/project/src',
          invocationDirectory: process.cwd(),
          filePath: '/project/lib/other.mld' // Not in src!
        };
        
        const validation = await service.validate(context);
        
        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain('filePath must be in fileDirectory');
      });
    });
    
    describe('utility methods', () => {
      let context: any;
      
      beforeEach(async () => {
        context = await PathContextBuilder.fromFile(
          '/project/src/script.mld',
          fileSystem,
          { invocationDirectory: '/home/user' }
        );
      });
      
      it('should get display path relative to invocation directory', () => {
        const displayPath = service.getDisplayPath(context, '/project/src/script.mld');
        expect(displayPath).toBe('../../project/src/script.mld');
      });
      
      it('should check if path is inside project', () => {
        expect(service.isInsideProject(context, '/project/src/file.mld')).toBe(true);
        expect(service.isInsideProject(context, '/project/lib/util.mld')).toBe(true);
        expect(service.isInsideProject(context, '/outside/file.mld')).toBe(false);
        expect(service.isInsideProject(context, '/project/../outside.mld')).toBe(false);
      });
      
      it('should resolve paths from file directory', () => {
        expect(service.resolveFromFile(context, './sibling.mld'))
          .toBe('/project/src/sibling.mld');
        expect(service.resolveFromFile(context, '../lib/util.mld'))
          .toBe('/project/lib/util.mld');
      });
      
      it('should resolve paths from project root', () => {
        expect(service.resolveFromProject(context, './src/file.mld'))
          .toBe('/project/src/file.mld');
        expect(service.resolveFromProject(context, 'lib/util.mld'))
          .toBe('/project/lib/util.mld');
      });
    });
  });
});