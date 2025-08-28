#!/usr/bin/env node
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// ANSI color codes
const yellow = '\x1b[33m';
const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

// Track build steps
const steps = [
  { name: 'version', display: 'Generating version' },
  { name: 'errors', display: 'Building error patterns' },
  { name: 'grammar', display: 'Building grammar' },
  { name: 'typescript', display: 'Compiling TypeScript' },
  { name: 'python', display: 'Building Python wrapper' },
  { name: 'wasm', display: 'Copying WASM files' },
  { name: 'sync', display: 'Syncing mlldx' }
];

let currentStep = 0;
let buildOutput = [];
let errorOccurred = false;

function showProgress(step, status = 'running') {
  process.stdout.write('\r\x1b[K'); // Clear current line
  const dots = '.'.repeat((currentStep % 3) + 1).padEnd(3);
  
  if (status === 'running') {
    process.stdout.write(`${yellow}Building${dots}${reset} [${currentStep + 1}/${steps.length}] ${step}`);
  } else if (status === 'done') {
    process.stdout.write(`${green}✓${reset} [${currentStep}/${steps.length}] ${step}\n`);
  } else if (status === 'error') {
    process.stdout.write(`${red}✗${reset} [${currentStep}/${steps.length}] ${step}\n`);
  }
}

async function runCommand(command, stepName) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: projectRoot
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      buildOutput.push({
        step: stepName,
        stdout: output,
        stderr: errorOutput,
        exitCode: code
      });
      
      if (code !== 0) {
        errorOccurred = true;
        reject(new Error(`${stepName} failed with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

// Run a command but do not fail the build on non-zero exit.
// Useful for optional steps like copying WASM files where environments may vary.
async function runCommandOptional(command, stepName) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd: projectRoot
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      buildOutput.push({
        step: stepName,
        stdout: output,
        stderr: errorOutput,
        exitCode: code,
        optional: true
      });

      if (code !== 0) {
        // Log as a warning and continue
        console.warn(`\n${yellow}Warning:${reset} Optional step '${stepName}' exited with code ${code}. Continuing...`);
        if (errorOutput) {
          console.warn('stderr:');
          console.warn(errorOutput);
        }
        if (output) {
          console.warn('stdout:');
          console.warn(output);
        }
      }
      resolve();
    });
  });
}

async function build() {
  console.log(`${yellow}Starting quiet build...${reset}\n`);
  
  // Check for missing grammar files first
  const criticalFiles = [
    'grammar/generated/parser/parser.js',
    'grammar/generated/parser/parser.ts',
    'grammar/generated/parser/parser.cjs'
  ];
  
  const missingFiles = criticalFiles.filter(file => !existsSync(join(projectRoot, file)));
  
  try {
    // Build grammar if needed
    if (missingFiles.length > 0) {
      showProgress('Building missing grammar files', 'running');
      await runCommand('npm run build:grammar:core', 'grammar-pre');
      showProgress('Grammar files generated', 'done');
      currentStep++;
    }
    
    // Run build steps
    showProgress(steps[currentStep].display, 'running');
    await runCommand('npm run build:version', 'version');
    showProgress(steps[currentStep].display, 'done');
    currentStep++;
    
    showProgress(steps[currentStep].display, 'running');
    await runCommand('npm run build:errors', 'errors');
    showProgress(steps[currentStep].display, 'done');
    currentStep++;
    
    showProgress(steps[currentStep].display, 'running');
    await runCommand('npm run build:grammar', 'grammar');
    showProgress(steps[currentStep].display, 'done');
    currentStep++;
    
    showProgress(steps[currentStep].display, 'running');
    await runCommand('tsup', 'typescript');
    showProgress(steps[currentStep].display, 'done');
    currentStep++;
    
    showProgress(steps[currentStep].display, 'running');
    await runCommand('npm run build:python', 'python');
    showProgress(steps[currentStep].display, 'done');
    currentStep++;
    
    showProgress(steps[currentStep].display, 'running');
    if (process.env.CI) {
      console.log(`\n${yellow}[info]${reset} WASM copy step is optional in CI environments.`);
    }
    await runCommandOptional('npm run build:wasm', 'wasm');
    showProgress(steps[currentStep].display, 'done');
    currentStep++;
    
    showProgress(steps[currentStep].display, 'running');
    // sync:mlldx handles CI detection internally and exits gracefully
    await runCommand('npm run sync:mlldx', 'sync');
    showProgress(steps[currentStep].display, 'done');
    
    console.log(`\n${green}✅ Build completed successfully!${reset}`);
    
  } catch (error) {
    console.log(`\n${red}❌ Build failed!${reset}\n`);
    
    // First check what step actually threw the error
    if (error.message) {
      const failedStep = error.message.match(/(\w+) failed/)?.[1];
      if (failedStep) {
        console.log(`${red}Error in step: ${failedStep}${reset}\n`);
        
        // Find the output for this specific step
        const stepOutput = buildOutput.find(e => e.step === failedStep);
        if (stepOutput) {
          if (stepOutput.stderr) {
            console.log('Error output:');
            console.log(stepOutput.stderr);
          }
          if (stepOutput.stdout && stepOutput.stdout.includes('Error')) {
            console.log('Output:');
            console.log(stepOutput.stdout);
          }
        }
      } else {
        console.log(`${red}Error: ${error.message}${reset}\n`);
      }
    }
    
    // Show any non-optional failures
    const failures = buildOutput.filter(e => e.exitCode && e.exitCode !== 0 && !e.optional);
    if (failures.length > 0 && !error.message?.includes('failed')) {
      console.log(`${red}Failed steps:${reset}`);
      failures.forEach(e => {
        console.log(` - ${e.step} (exit ${e.exitCode})`);
      });
    }
    // Also show any non-zero optional steps as warnings
    const optionalFailures = buildOutput.filter(e => e.exitCode && e.exitCode !== 0 && e.optional);
    if (optionalFailures.length > 0) {
      console.log(`\n${yellow}Optional step warnings:${reset}`);
      optionalFailures.forEach(e => {
        console.log(` - ${e.step} (exit ${e.exitCode})`);
      });
    }
    
    console.log(`\nRun ${yellow}npm run build:verbose${reset} to see full output.`);
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(`\n\n${yellow}Build interrupted${reset}`);
  if (buildOutput.length > 0 && errorOccurred) {
    console.log('Partial output available. Run with --verbose to see details.');
  }
  process.exit(130);
});

build().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
