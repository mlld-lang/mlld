# Test Audit Script

This script assists in auditing test files for compliance with the TESTS.md standards and helps identify tests that need to be updated for proper DI implementation.

## Overview

The script automates the process of:
1. Finding all test files in the codebase
2. Analyzing each file for mock usage and DI compliance
3. Categorizing tests based on adherence to standards
4. Generating a comprehensive report of findings
5. Creating a prioritized list of files to update

## Prerequisites

- Node.js 14+ installed
- TypeScript installed (`npm install -g typescript`)
- Access to the codebase

## Usage

### Running the Audit

```bash
# Install dependencies if needed
npm install

# Run the script with ts-node
npx ts-node test-audit-script.ts
```

### Output Files

The script generates two output files:

1. **test-audit-results.md**: A detailed audit report with:
   - Summary statistics
   - Analysis by service area
   - Detailed findings for each test file
   - Categorized issues and required changes

2. **test-files-to-update.txt**: A simple list of all files with mocks that need updates, sorted by priority.

## Audit Categories

Files are categorized based on compliance with TESTS.md standards:

- 🟢 **Compliant**: Test follows TESTS.md standards and works with DI
- 🟡 **Minor Issues**: Test mostly follows standards but needs minor adjustments
- 🟠 **Major Issues**: Test needs significant restructuring to work with DI
- 🔴 **Critical Failure**: Test is completely broken and blocking other functionality

## Customization

You can customize the script by modifying:

- **EXCLUDE_PATTERNS**: To skip specific directories or file patterns
- **PRIORITY_PATTERNS**: To highlight specific high-priority test files
- **patterns**: To add or modify the patterns checked for compliance
- **mockPatterns**: To refine how mock usage is detected

## Next Steps After Audit

1. Review the `test-audit-results.md` file for a comprehensive overview
2. Use `test-files-to-update.txt` as a checklist for updates
3. Start implementing fixes based on the recommended priority order:
   - Priority files identified in the audit
   - Critical failures (🔴)
   - Major issues (🟠) 
   - Minor issues (🟡)
4. Use `test-update-template.md` as a guide for standardized updates 