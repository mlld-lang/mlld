import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, isAbsolute } from 'path';

const execAsync = promisify(exec);

/**
 * Checks if a file has uncommitted changes in git
 * @param filePath - Path to the file to check (relative or absolute)
 * @returns Promise<boolean> - True if file has uncommitted changes, false otherwise
 */
export async function hasUncommittedChanges(filePath: string): Promise<boolean> {
  try {
    // Resolve to absolute path if relative
    const absolutePath = isAbsolute(filePath) ? filePath : resolve((process.cwd as () => string)(), filePath);
    
    // Run git status for the specific file
    const { stdout } = await execAsync(`git status --porcelain -- "${absolutePath}"`, {
      cwd: (process.cwd as () => string)()
    });
    
    // If stdout has content, the file has changes
    return stdout.trim().length > 0;
  } catch (error) {
    // If git command fails (e.g., not in a git repo), return false
    return false;
  }
}

/**
 * Gets detailed git status for a file
 * @param filePath - Path to the file to check (relative or absolute)
 * @returns Promise<'modified' | 'untracked' | 'clean' | 'error'> - Detailed status of the file
 */
export async function getGitStatus(filePath: string): Promise<'modified' | 'untracked' | 'clean' | 'error'> {
  try {
    // Resolve to absolute path if relative
    const absolutePath = isAbsolute(filePath) ? filePath : resolve((process.cwd as () => string)(), filePath);
    
    // Run git status for the specific file
    const { stdout } = await execAsync(`git status --porcelain -- "${absolutePath}"`, {
      cwd: (process.cwd as () => string)()
    });
    
    const statusLine = stdout.trim();
    
    // No output means the file is clean (tracked and unmodified)
    if (!statusLine) {
      // Check if file is tracked at all
      try {
        await execAsync(`git ls-files --error-unmatch -- "${absolutePath}"`, {
          cwd: (process.cwd as () => string)()
        });
        return 'clean';
      } catch {
        // File is not tracked, but also not showing in status (might not exist)
        return 'clean';
      }
    }
    
    // Parse the status indicators
    const statusCode = statusLine.substring(0, 2);
    
    // Check for untracked files
    if (statusCode.startsWith('??')) {
      return 'untracked';
    }
    
    // Any other status code means modified (M, A, D, R, C, U, etc.)
    return 'modified';
  } catch (error) {
    // If git command fails (e.g., not in a git repo), return error
    return 'error';
  }
}