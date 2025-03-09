import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Handle both ESM and CommonJS environments
const getPackageJsonPath = () => {
  try {
    // ESM environment
    if (typeof import.meta === 'object' && import.meta.url) {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      return join(__dirname, '../package.json');
    } 
    // CommonJS environment
    else {
      return join(__dirname, '../package.json');
    }
  } catch (error) {
    // Fallback to a relative path if all else fails
    return join(process.cwd(), 'package.json');
  }
};

// Read version from package.json
let version = '0.0.0';
try {
  const packageJsonPath = getPackageJsonPath();
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  version = packageJson.version;
} catch (error) {
  // Fallback version if we can't read the package.json
  console.warn('Failed to read version from package.json:', error);
}

export { version }; 