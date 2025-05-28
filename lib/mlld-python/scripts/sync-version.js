#!/usr/bin/env node

/**
 * Sync version from main mlld package.json to Python package
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read main package.json
const mainPackageJson = path.join(__dirname, '../../../package.json');
const mainPackage = JSON.parse(fs.readFileSync(mainPackageJson, 'utf8'));

// Update Python __init__.py
const initPyPath = path.join(__dirname, '../src/mlld/__init__.py');
let initPyContent = fs.readFileSync(initPyPath, 'utf8');

// Replace version line
initPyContent = initPyContent.replace(
  /__version__ = ["'][\d.]+["']/,
  `__version__ = "${mainPackage.version}"`
);

fs.writeFileSync(initPyPath, initPyContent);

console.log(`✅ Synced version to ${mainPackage.version}`);

// Also update setup.py if it exists
const setupPyPath = path.join(__dirname, '../setup.py');
if (fs.existsSync(setupPyPath)) {
  let setupPyContent = fs.readFileSync(setupPyPath, 'utf8');
  setupPyContent = setupPyContent.replace(
    /version=["'][\d.]+["']/,
    `version="${mainPackage.version}"`
  );
  fs.writeFileSync(setupPyPath, setupPyContent);
}