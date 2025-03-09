import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Handle both ESM and CommonJS environments
const getPackageJsonPath = () => {
  try {
    // For CommonJS compatibility, avoid using import.meta
    // Instead, use a relative path from the current file
    return join(process.cwd(), 'package.json');
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