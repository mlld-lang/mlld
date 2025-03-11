const fs = require('fs');
const path = require('path');

// Source and destination directories
const sourceDir = path.join(__dirname, '../../docs');
const outputDir = path.join(__dirname, 'docs');

// Debug filename checking
function debugFilePath(filePath) {
  const isDevFile = filePath.includes('/dev/') || filePath.includes('\\dev\\');
  const parts = filePath.split(path.sep);
  console.log(`Path: ${filePath}`);
  console.log(`Parts: ${JSON.stringify(parts)}`);
  console.log(`Includes '/dev/': ${filePath.includes('/dev/')}`);
  console.log(`Includes '\\dev\\': ${filePath.includes('\\dev\\')}`);
  console.log(`Is dev file: ${isDevFile}`);
  return isDevFile;
}

// Skip the dev directory
function shouldSkipFile(filePath) {
  // Only skip files that are in the docs/dev/ directory
  return filePath.includes(`${path.sep}docs${path.sep}dev${path.sep}`);
}

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Function to convert a file
function convertFile(filePath) {
  // Debug the first few files
  debugFilePath(filePath);
  
  // Skip files in the dev directory
  if (shouldSkipFile(filePath)) {
    console.log(`Skipping dev file: ${filePath}`);
    return;
  }

  const relativePath = path.relative(sourceDir, filePath);
  
  // Special handling for README.md files - they should generate index.html in their directory
  const baseFileName = path.basename(filePath);
  const isReadme = baseFileName.toLowerCase() === 'readme.md';
  
  let outputPath;
  if (isReadme) {
    // For README.md, create index.html in the same directory
    const dirName = path.dirname(relativePath);
    outputPath = path.join(outputDir, dirName, 'index.md');
    console.log(`Special handling for README: ${filePath} -> ${outputPath}`);
  } else {
    // Normal handling for other files
    outputPath = path.join(outputDir, relativePath);
  }
  
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
  
  // Add frontmatter
  const newContent = `---
layout: docs.njk
title: "${title}"
---

${content}`;
  
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