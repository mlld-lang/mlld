const fs = require('fs');
const path = require('path');

// Source and destination directories
const sourceDir = path.join(__dirname, '../userdocs');
const outputDir = path.join(__dirname, '../src/docs');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Function to convert a file
function convertFile(filePath) {
  const relativePath = path.relative(sourceDir, filePath);
  const outputPath = path.join(outputDir, relativePath);
  
  // Create output directory if it doesn't exist
  const outputDirPath = path.dirname(outputPath);
  if (!fs.existsSync(outputDirPath)) {
    fs.mkdirSync(outputDirPath, { recursive: true });
  }
  
  // Read the source file
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract the title from the first heading
  const titleMatch = content.match(/^#\s+(.*)$/m);
  let title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md');
  
  // Escape special characters in YAML by wrapping title in quotes
  title = title.replace(/"/g, '\\"'); // Escape double quotes if present
  
  // Add a raw tag at the beginning and end of the content to prevent Nunjucks from processing
  // any template tags in the markdown content
  const processedContent = '{% raw %}\n' + content + '\n{% endraw %}';
  
  // Add frontmatter
  const newContent = `---
layout: docs.njk
title: "${title}"
---

${processedContent}`;
  
  // Write to destination
  fs.writeFileSync(outputPath, newContent);
  console.log(`Converted: ${relativePath} to ${outputPath}`);
}

// Function to process a directory recursively
function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      processDirectory(filePath);
    } else if (stats.isFile() && path.extname(file) === '.md') {
      convertFile(filePath);
    }
  }
}

// Start processing
processDirectory(sourceDir);
console.log('Documentation conversion complete!');