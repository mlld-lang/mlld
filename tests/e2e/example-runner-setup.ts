import { TestContextDI } from '@tests/utils/di/TestContextDI';
import path from 'path';
import { promises as realFs } from 'fs';
import { vi } from 'vitest';

// Configuration
export const TEST_CASES_DIR = 'tests/cases';
export const VALID_CASES_DIR = `${TEST_CASES_DIR}/valid`;
export const INVALID_CASES_DIR = `${TEST_CASES_DIR}/invalid`;
export const ERROR_EXTENSION = '.error.mld'; // Files expected to fail
export const EXPECTED_EXTENSION = '.expected.md'; // Expected output files

// Helper function to recursively find files with a specific extension
export async function findFiles(dir: string, extension: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await realFs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const nestedFiles = await findFiles(fullPath, extension);
        files.push(...nestedFiles);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }
  
  return files;
}

// Get a list of test case names for reporting
export function getTestCaseName(filePath: string): string {
  const relativePath = path.relative(TEST_CASES_DIR, filePath);
  return relativePath.replace(/\\/g, '/'); // Normalize path separators
}

// Create and setup test context
export async function setupTestContext(testFiles: string[]): Promise<TestContextDI> {
  // <<< Await the creation and initialization >>>
  const context = await TestContextDI.create(); 
  
  // <<< Ensure context has necessary properties before proceeding (optional guard) >>>
  if (!context || !context.registerMock || !context.fs) {
    throw new Error('TestContextDI did not initialize correctly.');
  }

  // Create a consistent CommandExecutionService mock for all tests
  const mockCommandExecutionService = {
    executeShellCommand: vi.fn().mockImplementation(async (command: string) => {
      console.log(`Mock executing shell command in e2e test: ${command}`);
      // Extract actual command output - strip out "echo" and any shell syntax
      const outputMatch = command.match(/^echo\s+(.*)$/);
      const output = outputMatch ? outputMatch[1].trim() : command.trim();
      return { stdout: output, stderr: '', exitCode: 0 };
    }),
    executeLanguageCode: vi.fn().mockImplementation(async (code: string, language: string) => {
      console.log(`Mock executing ${language} code in e2e test`);
      return { stdout: code.trim(), stderr: '', exitCode: 0 };
    })
  };
  
  // Register the mock service with the container
  context.registerMock('ICommandExecutionService', mockCommandExecutionService);
  
  // <<< Comment out call to non-existent method - Need to find replacement >>>
  /*
  context.enableTransformation({
    variables: true,
    directives: true,
    commands: true,
    imports: true
  });
  */
  
  // Add test files to the testing file system
  for (const filePath of testFiles) {
    const content = await realFs.readFile(filePath, 'utf-8');
    await context.fs.writeFile(filePath, content);
    
    // Also add any related files in the same directory
    const dir = path.dirname(filePath);
    try {
      const otherFiles = await realFs.readdir(dir);
      // Add any supporting files that might be needed (e.g., for imports)
      for (const otherFile of otherFiles) {
        const otherPath = path.join(dir, otherFile);
        if (otherPath !== filePath && (otherFile.endsWith('.mld') || otherFile.endsWith('.md'))) {
          try {
            const otherContent = await realFs.readFile(otherPath, 'utf-8');
            await context.fs.writeFile(otherPath, otherContent);
          } catch (error) {
            // Skip if can't read
          }
        }
      }
    } catch (error) {
      // Skip if directory can't be read
    }
  }
  
  return context;
}