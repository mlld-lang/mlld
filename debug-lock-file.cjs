const fs = require('fs');
const path = require('path');

async function debugLockFile() {
  try {
    const lockFilePath = path.join(process.cwd(), 'mlld.lock.json');
    console.log('Loading lock file from:', lockFilePath);
    
    // Just read the file directly
    const content = fs.readFileSync(lockFilePath, 'utf8');
    const lockData = JSON.parse(content);
    
    console.log('Lock file loaded successfully');
    console.log('Lock file content:', JSON.stringify(lockData, null, 2));
    
    // Check new config location first
    if (lockData.config?.resolvers?.registries) {
      console.log('Found resolver registries in new location:', JSON.stringify(lockData.config.resolvers.registries, null, 2));
    } else {
      console.log('No resolver registries found in new location');
    }
    
    // Check legacy location
    if (lockData.security?.registries) {
      console.log('Found registries in legacy location:', JSON.stringify(lockData.security.registries, null, 2));
    } else {
      console.log('No registries found in legacy location');
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugLockFile();