const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const examplesDir = path.join(__dirname, '../examples');
const files = fs.readdirSync(examplesDir);

const examples = {};

for (const file of files) {
  if (file.endsWith('.mld')) {
    const name = path.basename(file, '.mld');
    const code = fs.readFileSync(path.join(examplesDir, file), 'utf8');
    
    // Load metadata if exists
    let meta = {};
    try {
      const metaContent = fs.readFileSync(
        path.join(examplesDir, `${name}.meta.yml`), 
        'utf8'
      );
      meta = yaml.load(metaContent);
    } catch (e) {
      // No metadata file
    }
    
    examples[name] = {
      name,
      code,
      ...meta
    };
  }
}

module.exports = examples;