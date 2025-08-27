const fs = require('fs');
const path = require('path');

// Source and destination directories
// Now we only process docs/user directory
const sourceDir = path.join(__dirname, '../../docs/user');
const outputDir = path.join(__dirname, 'docs');

// Debug filename checking
function debugFilePath(filePath) {
  const parts = filePath.split(path.sep);
  console.log(`Path: ${filePath}`);
  console.log(`Parts: ${JSON.stringify(parts)}`);
  return false;
}

// Skip review files
function shouldSkipFile(filePath) {
  // Skip any -review.md files
  return filePath.includes('-review.md');
}

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Function to convert a file
function convertFile(filePath) {
  // Debug the first few files
  debugFilePath(filePath);
  
  // Skip review files
  if (shouldSkipFile(filePath)) {
    console.log(`Skipping review file: ${filePath}`);
    return;
  }

  const relativePath = path.relative(sourceDir, filePath);
  
  // Special handling for README.md files - they should generate index.html in their directory
  const baseFileName = path.basename(filePath);
  const isReadme = baseFileName.toLowerCase() === 'readme.md';
  
  let outputPath;
  if (isReadme) {
    // For README.md in the root, create index.md
    outputPath = path.join(outputDir, 'index.md');
    console.log(`Special handling for README: ${filePath} -> ${outputPath}`);
  } else {
    // Normal handling for other files - all go to the root of docs since we have no subdirs
    outputPath = path.join(outputDir, path.basename(filePath));
  }
  
  // Create output directory if it doesn't exist
  const outputDirPath = path.dirname(outputPath);
  if (!fs.existsSync(outputDirPath)) {
    fs.mkdirSync(outputDirPath, { recursive: true });
  }
  
  // Read the source file
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check if the file already has frontmatter
  const hasFrontmatter = content.startsWith('---\n');
  
  let newContent;
  if (hasFrontmatter) {
    // File already has frontmatter, just copy it as-is
    newContent = content;
  } else {
    // Extract the title from the first heading
    const titleMatch = content.match(/^#\s+(.*)$/m);
    let title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md');
    
    // Escape special characters in YAML by wrapping title in quotes
    title = title.replace(/"/g, '\\"'); // Escape double quotes if present
    
    // Add frontmatter
    newContent = `---
layout: docs.njk
title: "${title}"
---

${content}`;
  }
  
  // Write to destination
  fs.writeFileSync(outputPath, newContent);
  console.log(`Converted: ${relativePath} to ${outputPath}`);
}

// Function to process the docs/user directory (no subdirectories)
function processDirectory(dirPath) {
  // Check if the source directory exists
  if (!fs.existsSync(dirPath)) {
    console.error(`Source directory does not exist: ${dirPath}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    // Only process .md files in the root (no subdirectories)
    if (stats.isFile() && path.extname(file) === '.md') {
      convertFile(filePath);
    }
  }
}

// Start processing
processDirectory(sourceDir);
console.log('Documentation conversion complete!');