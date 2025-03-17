/**
 * E2E Case Runner
 * 
 * This script runs each e2e test case and generates the following output files:
 * - .o.md - Raw Markdown output
 * 
 * These files provide easy visual comparison between actual and expected output.
 * All output files are gitignored and updated on each run.
 * 
 * Usage:
 *   - node scripts/e2e-case-runner.js           # Generate output files
 *   - node scripts/e2e-case-runner.js clean     # Clean up generated output files
 *   - node scripts/e2e-case-runner.js --verbose # Show detailed output during processing
 */

const path = require('path');
const fs = require('fs').promises;
const { glob } = require('glob');
const { execSync } = require('child_process');

// Configuration
const TEST_CASES_DIR = 'tests/cases';
const VALID_CASES_DIR = `${TEST_CASES_DIR}/valid`;
const INVALID_CASES_DIR = `${TEST_CASES_DIR}/invalid`;
const ERROR_EXTENSION = '.error.mld'; // Files expected to fail

// File extensions for outputs
const OUTPUT_MD_EXT = '.o.md';
const OUTPUT_PRETTY_MD_EXT = '.o.pretty.md';
const OUTPUT_XML_EXT = '.o.xml';

// Parse command line arguments
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose');
const isClean = args.includes('clean');

// Custom logger that respects verbose mode
const logger = {
  log: (...messages) => {
    if (isVerbose) {
      console.log(...messages);
    }
  },
  error: (...messages) => {
    console.error(...messages);
  }
};

// Progress indicator
let interval;
let filesProcessed = 0;
let totalFiles = 0;
let errors = [];

function startProgress() {
  if (isVerbose) return; // Don't show progress in verbose mode
  
  console.log(`Processing ${totalFiles} test files...`);
}

function updateProgress(filePath, error = null) {
  filesProcessed++;
  
  if (!isVerbose) {
    if (error) {
      // Get parent directory and filename
      const dirParts = path.dirname(filePath).split(path.sep);
      const parentDir = dirParts[dirParts.length - 1]; // Last directory name
      const fileName = path.basename(filePath);
      const filePathDisplay = `${parentDir}/${fileName}`;
      
      // Only show errors for files not in the invalid directory and without 'error' in the name
      const isInvalidDir = filePath.includes(INVALID_CASES_DIR);
      const hasErrorInName = fileName.toLowerCase().includes('error');
      
      if (!isInvalidDir && !hasErrorInName) {
        console.log(`${filesProcessed}/${totalFiles} - Error processing ${filePathDisplay}`);
        errors.push(filePathDisplay);
      } else {
        // For invalid files or error files, errors are expected
        logger.log(`Expected error in test: ${filePathDisplay}`);
      }
    } else if (filesProcessed % 5 === 0 || filesProcessed === totalFiles) {
      // Show progress every 5 files or at the end
      console.log(`${filesProcessed}/${totalFiles} completed`);
    }
  }
}

function stopProgress(message = 'Done') {
  if (!isVerbose) {
    console.log(`✓ ${message}`);
    if (errors.length > 0) {
      console.log(`\nEncountered ${errors.length} unexpected errors during processing:`);
      errors.forEach((filePath, index) => {
        console.log(`  ${index + 1}. ${filePath}`);
      });
    }
  }
}

/**
 * Generate output files for a given test file
 */
async function generateOutputs(filePath) {
  const basePath = filePath.replace(/\.mld$/, '').replace(/\.error\.mld$/, '.error');
  const mdOutputPath = `${basePath}${OUTPUT_MD_EXT}`;
  
  try {
    // First read the source file
    logger.log(`Reading source file ${filePath}`);
    const sourceContent = await fs.readFile(filePath, 'utf-8');
    
    // Create a temp file to capture the output
    const tempOutputPath = `${basePath}.temp_output`;
    
    // Run meld CLI command to generate markdown output
    logger.log(`Generating markdown output for ${filePath}`);
    execSync(`node bin/meld-wrapper.js ${filePath} --output ${tempOutputPath}`, { encoding: 'utf8', stdio: isVerbose ? 'inherit' : 'pipe' });
    
    // Read the generated output
    const mdResult = await fs.readFile(tempOutputPath, 'utf-8');
    
    // Save raw markdown output
    logger.log(`Writing to ${mdOutputPath}`);
    await fs.writeFile(mdOutputPath, mdResult);
    
    // Clean up temp file
    try {
      await fs.unlink(tempOutputPath);
    } catch (e) {
      // Ignore errors when deleting temp file
    }
    
    logger.log(`Successfully generated output for: ${path.basename(filePath)}`);
    updateProgress(filePath);
  } catch (error) {
    // If there's an error, write it to the output file
    const errorMessage = `Error processing file: ${filePath}\n\n---\n\n${error.message || 'Unknown error'}\n\n${error.stack || ''}`;
    
    await fs.writeFile(mdOutputPath, errorMessage);
    
    // Check if this is an expected error
    const fileName = path.basename(filePath);
    const isInvalidDir = filePath.includes(INVALID_CASES_DIR);
    const hasErrorInName = fileName.toLowerCase().includes('error');
    
    if (!isInvalidDir && !hasErrorInName) {
      logger.error(`Error processing: ${fileName}`);
    } else {
      logger.log(`Expected error in test: ${fileName}`);
    }
    
    updateProgress(filePath, error);
  }
}

/**
 * Simple XML escaping for error messages
 */
function escapeXml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Find files matching a pattern
 */
async function findFiles(pattern) {
  try {
    logger.log(`Searching for files matching: ${pattern}`);
    const files = await glob(pattern);
    logger.log(`Found ${files.length} files matching: ${pattern}`);
    return files;
  } catch (error) {
    logger.error(`Error searching for files with pattern ${pattern}:`, error);
    throw error;
  }
}

/**
 * Clean up all generated output files
 */
async function cleanOutputFiles() {
  try {
    logger.log('Cleaning up generated output files...');
    
    // Find all output files (including legacy .pretty and .xml files)
    const mdOutputFiles = await findFiles(`${TEST_CASES_DIR}/**/*${OUTPUT_MD_EXT}`);
    const prettyOutputFiles = await findFiles(`${TEST_CASES_DIR}/**/*${OUTPUT_PRETTY_MD_EXT}`);
    const xmlOutputFiles = await findFiles(`${TEST_CASES_DIR}/**/*${OUTPUT_XML_EXT}`);
    
    const allOutputFiles = [...mdOutputFiles, ...prettyOutputFiles, ...xmlOutputFiles];
    totalFiles = allOutputFiles.length;
    
    if (!isVerbose) {
      console.log(`Cleaning ${totalFiles} output files...`);
    } else {
      console.log(`Found ${totalFiles} output files to clean`);
    }
    
    // Delete each file
    for (const filePath of allOutputFiles) {
      try {
        await fs.unlink(filePath);
        logger.log(`Deleted: ${filePath}`);
        updateProgress(filePath);
      } catch (error) {
        logger.error(`Failed to delete ${filePath}:`, error.message);
        updateProgress(filePath, error);
      }
    }
    
    stopProgress(`Cleaned up ${allOutputFiles.length} output files`);
  } catch (error) {
    logger.error('Error cleaning up files:', error);
    stopProgress('Failed to clean up all files');
  }
}

/**
 * Main function
 */
async function run() {
  try {
    // Check if clean command was passed
    if (isClean) {
      await cleanOutputFiles();
      return;
    }
    
    // First build the project
    logger.log('Building project...');
    execSync('npm run build', { stdio: isVerbose ? 'inherit' : 'pipe' });
    
    // Find all valid test files
    const validFiles = await findFiles(`${VALID_CASES_DIR}/**/*.mld`);
    logger.log(`Found ${validFiles.length} valid test files to process`);
    
    // Find all invalid test files
    const invalidFiles = await findFiles(`${INVALID_CASES_DIR}/**/*${ERROR_EXTENSION}`);
    logger.log(`Found ${invalidFiles.length} invalid test files to process`);
    
    // Set total for progress indicator
    totalFiles = validFiles.length + invalidFiles.length;
    errors = []; // Reset errors array
    
    if (!isVerbose) {
      startProgress();
    } else {
      console.log(`Found ${totalFiles} test files to process`);
    }
    
    // Process valid test files
    logger.log('Processing valid test files...');
    for (const filePath of validFiles) {
      await generateOutputs(filePath);
    }
    
    // Process invalid test files
    logger.log('Processing invalid test files...');
    for (const filePath of invalidFiles) {
      await generateOutputs(filePath);
    }
    
    stopProgress(`Finished processing ${totalFiles} test files`);
  } catch (error) {
    logger.error('Error in main process:', error);
    stopProgress('Processing failed');
  }
}

// Run the main function
run();