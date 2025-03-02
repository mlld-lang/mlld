# CLI Command Integration for Debug Issue Detection

## Overview

This feature integrates the Debug Issue Detection system with Meld's CLI commands, making it easy for users to detect and analyze issues with their templates directly from the command line. It enhances existing debug commands and adds new commands specifically for issue detection.

## Problem Statement

Currently, Meld's CLI provides basic debugging commands, but users must manually analyze the output to identify problems. This requires deep knowledge of Meld's internals and significant time investment. A more automated approach to issue detection would make debugging more accessible and efficient.

## Goals

- Enhance existing debug commands with issue detection capabilities
- Add new commands specifically for finding and reporting issues
- Provide user-friendly output formats for detected issues
- Make command options and flags consistent and intuitive
- Ensure CLI output is readable in terminal environments

## Non-Goals

- Creating a GUI for issue detection (CLI-only feature)
- Automatically fixing detected issues
- Integrating with external tools or IDEs (separate feature)
- Replacing existing visualization commands

## Feature Requirements

### Enhanced Existing Commands

Add issue detection capabilities to the following existing commands:

1. **`meld debug-resolution`**
   - Add `--detect-issues` flag to enable issue detection
   - Add `--show-suggestions` flag to include suggested fixes
   - Add `--issue-severity` option to filter by severity level

2. **`meld debug-context`**
   - Add `--detect-issues` flag to detect context boundary issues
   - Add `--show-imports` flag to analyze import chain issues

3. **`meld debug-transform`**
   - Add `--detect-issues` flag to find transformation pipeline issues

### New Issue-Specific Commands

Add the following new commands:

1. **`meld debug-issues`**
   - Main command for comprehensive issue detection
   - Combines multiple issue detection types in one report
   - Includes severity filtering and categorization

2. **`meld debug-analyze`**
   - Deeper analysis of a specific issue or variable
   - Provides more detailed information and suggestions
   - Includes historical analysis of how the issue occurred

### Output Formatting

Implement the following output formats:

1. **Text Format**
   - Clean, readable text output for terminal
   - Color-coded by severity (if terminal supports it)
   - Structured for readability with sections and indentation

2. **JSON Format**
   - Machine-readable format for processing or storing results
   - Complete issue information for programmatic consumption
   - Consistent structure for all commands

3. **Markdown Format**
   - Well-formatted markdown for documentation or reporting
   - Includes tables, headers, and code blocks
   - Suitable for sharing or storing in repositories

## Technical Implementation

### Command Definition Structure

```typescript
// Enhanced debug-resolution command
program
  .command('debug-resolution <file>')
  .description('Debug variable resolution across context boundaries')
  .option('--var <name>', 'Track a specific variable')
  .option('--output <format>', 'Output format (text, json, markdown)', 'text')
  .option('--detect-issues', 'Detect and report issues', false)
  .option('--issue-severity <level>', 'Minimum issue severity (info, warning, error)', 'warning')
  .option('--show-suggestions', 'Include suggested fixes', true)
  .option('--sample-rate <rate>', 'Sampling rate for high-volume tracking (0.0-1.0)', '1.0')
  .action(debugResolutionCommand);

// New debug-issues command
program
  .command('debug-issues <file>')
  .description('Detect and report issues in a template')
  .option('--var <name>', 'Limit to a specific variable')
  .option('--type <types...>', 'Issue types to include (unresolved, boundary, inconsistent, import, performance)')
  .option('--severity <level>', 'Minimum issue severity (info, warning, error)', 'warning')
  .option('--output <format>', 'Output format (text, json, markdown)', 'text')
  .option('--show-suggestions', 'Include suggested fixes', true)
  .option('--sample-rate <rate>', 'Sampling rate for high-volume tracking (0.0-1.0)', '1.0')
  .action(debugIssuesCommand);
```

### Command Implementation

```typescript
// Implementation of enhanced debug-resolution command
async function debugResolutionCommand(file: string, options: any) {
  // Configure debug tracking
  debugTracker.configure({
    enabled: true,
    watchVariables: options.var ? [options.var] : undefined,
    samplingRate: parseFloat(options.sampleRate) || 1.0
  });
  
  // Process the file
  try {
    await processFile(file);
    
    // Get debug data
    const debugData = options.var 
      ? debugTracker.getDebugDataForVariable(options.var)
      : debugTracker.getAllDebugData();
    
    // Generate resolution report (existing functionality)
    const resolutionReport = formatResolutionReport(debugData, options.output);
    
    // Detect issues if requested
    if (options.detectIssues) {
      const issueDetector = new IssueDetectorService();
      const issues = issueDetector.detectIssues(debugData)
        .filter(issue => getSeverityLevel(issue.severity) >= getSeverityLevel(options.issueSeverity));
      
      // Generate issue report
      const issueReport = formatIssueReport(issues, {
        format: options.output,
        includeSuggestions: options.showSuggestions,
        colorize: process.stdout.isTTY
      });
      
      // Output combined report
      console.log(resolutionReport);
      console.log('\nISSUES DETECTED:');
      console.log(issueReport);
    } else {
      // Output just resolution report
      console.log(resolutionReport);
    }
  } catch (error) {
    console.error(`Error processing file: ${error.message}`);
    process.exit(1);
  }
}

// Implementation of new debug-issues command
async function debugIssuesCommand(file: string, options: any) {
  // Configure debug tracking
  debugTracker.configure({
    enabled: true,
    watchVariables: options.var ? [options.var] : undefined,
    samplingRate: parseFloat(options.sampleRate) || 1.0
  });
  
  // Process the file
  try {
    await processFile(file);
    
    // Get debug data
    const debugData = options.var 
      ? debugTracker.getDebugDataForVariable(options.var)
      : debugTracker.getAllDebugData();
    
    // Configure issue detector with type filtering
    const issueDetectorOptions: IssueDetectorOptions = {};
    
    if (options.type && options.type.length > 0) {
      issueDetectorOptions.includeTypes = options.type;
    }
    
    // Detect issues
    const issueDetector = new IssueDetectorService(issueDetectorOptions);
    const issues = issueDetector.detectIssues(debugData)
      .filter(issue => getSeverityLevel(issue.severity) >= getSeverityLevel(options.severity));
    
    // Generate and output report
    const issueReport = formatIssueReport(issues, {
      format: options.output,
      includeSuggestions: options.showSuggestions,
      colorize: process.stdout.isTTY
    });
    
    if (issues.length === 0) {
      console.log('No issues detected.');
    } else {
      console.log(`Found ${issues.length} issues:`);
      console.log(issueReport);
    }
  } catch (error) {
    console.error(`Error processing file: ${error.message}`);
    process.exit(1);
  }
}
```

### Report Formatting

```typescript
// Format issue report in different output formats
function formatIssueReport(
  issues: Issue[], 
  options: { 
    format: 'text' | 'json' | 'markdown',
    includeSuggestions: boolean,
    colorize: boolean
  }
): string {
  if (options.format === 'json') {
    return JSON.stringify(issues, null, 2);
  }
  
  if (options.format === 'markdown') {
    return formatIssuesAsMarkdown(issues, options);
  }
  
  // Default text format
  return formatIssuesAsText(issues, options);
}

// Format issues as colored text
function formatIssuesAsText(
  issues: Issue[],
  options: { includeSuggestions: boolean, colorize: boolean }
): string {
  if (issues.length === 0) {
    return 'No issues detected.';
  }
  
  const { includeSuggestions, colorize } = options;
  
  return issues.map(issue => {
    // Color coding by severity
    const severityColor = colorize ? getSeverityColor(issue.severity) : '';
    const resetColor = colorize ? '\x1b[0m' : '';
    
    let output = `${severityColor}${issue.severity.toUpperCase()}${resetColor}: ${issue.message}\n`;
    output += `  Contexts: ${issue.contexts.join(', ')}\n`;
    
    if (issue.details) {
      output += `  Details: ${issue.details}\n`;
    }
    
    if (includeSuggestions && issue.suggestions.length > 0) {
      output += '  Suggestions:\n';
      issue.suggestions.forEach(suggestion => {
        output += `    • ${suggestion}\n`;
      });
    }
    
    return output;
  }).join('\n');
}

// Helper to get ANSI color code by severity
function getSeverityColor(severity: 'error' | 'warning' | 'info'): string {
  switch (severity) {
    case 'error': return '\x1b[31m'; // Red
    case 'warning': return '\x1b[33m'; // Yellow
    case 'info': return '\x1b[36m'; // Cyan
    default: return '';
  }
}

// Format issues as markdown
function formatIssuesAsMarkdown(
  issues: Issue[],
  options: { includeSuggestions: boolean }
): string {
  if (issues.length === 0) {
    return 'No issues detected.';
  }
  
  const { includeSuggestions } = options;
  
  let markdown = '# Issue Report\n\n';
  
  // Group issues by severity
  const issuesBySeverity = {
    error: issues.filter(i => i.severity === 'error'),
    warning: issues.filter(i => i.severity === 'warning'),
    info: issues.filter(i => i.severity === 'info')
  };
  
  // Add summary table
  markdown += '## Summary\n\n';
  markdown += '| Severity | Count |\n';
  markdown += '| -------- | ----- |\n';
  markdown += `| Error    | ${issuesBySeverity.error.length} |\n`;
  markdown += `| Warning  | ${issuesBySeverity.warning.length} |\n`;
  markdown += `| Info     | ${issuesBySeverity.info.length} |\n`;
  markdown += '\n';
  
  // Add detailed sections by severity
  if (issuesBySeverity.error.length > 0) {
    markdown += '## Errors\n\n';
    issuesBySeverity.error.forEach(issue => {
      markdown += formatIssueAsMarkdown(issue, includeSuggestions);
    });
  }
  
  if (issuesBySeverity.warning.length > 0) {
    markdown += '## Warnings\n\n';
    issuesBySeverity.warning.forEach(issue => {
      markdown += formatIssueAsMarkdown(issue, includeSuggestions);
    });
  }
  
  if (issuesBySeverity.info.length > 0) {
    markdown += '## Information\n\n';
    issuesBySeverity.info.forEach(issue => {
      markdown += formatIssueAsMarkdown(issue, includeSuggestions);
    });
  }
  
  return markdown;
}

// Format a single issue as markdown
function formatIssueAsMarkdown(issue: Issue, includeSuggestions: boolean): string {
  let markdown = `### ${issue.message}\n\n`;
  
  markdown += `**Contexts:** ${issue.contexts.join(', ')}\n\n`;
  
  if (issue.details) {
    markdown += `**Details:** ${issue.details}\n\n`;
  }
  
  if (includeSuggestions && issue.suggestions.length > 0) {
    markdown += '**Suggestions:**\n\n';
    issue.suggestions.forEach(suggestion => {
      markdown += `- ${suggestion}\n`;
    });
    markdown += '\n';
  }
  
  return markdown;
}
```

## Sample Usage Examples

### Example 1: Basic Issue Detection

```bash
# Detect issues in a template
meld debug-issues template.meld

# Output:
# Found 2 issues:
# 
# ERROR: Variable 'userData' was never successfully resolved
#   Contexts: template.meld, imported.meld
#   Suggestions:
#     • Check if the variable is defined in an accessible scope
#     • Verify variable name spelling
#     • Check import directives
# 
# WARNING: Variable 'config' resolves to different values in different contexts
#   Contexts: template.meld: {"name":"Default"}, imported.meld: {"name":"Special"}
#   Suggestions:
#     • Check for variable shadowing
#     • Verify import order is consistent
```

### Example 2: Enhanced Resolution Debugging

```bash
# Debug resolution with issue detection
meld debug-resolution template.meld --var userData --detect-issues

# Output first shows the regular resolution debug information, then adds:
# 
# ISSUES DETECTED:
# ERROR: Variable 'userData' was never successfully resolved
#   Contexts: template.meld, imported.meld
#   Suggestions:
#     • Check if the variable is defined in an accessible scope
#     • Verify variable name spelling
#     • Check import directives
```

### Example 3: JSON Output

```bash
# Get issues in JSON format
meld debug-issues template.meld --output json

# Output:
# [
#   {
#     "type": "unresolved_variable",
#     "severity": "error",
#     "message": "Variable 'userData' was never successfully resolved",
#     "contexts": ["template.meld", "imported.meld"],
#     "suggestions": [
#       "Check if the variable is defined in an accessible scope",
#       "Verify variable name spelling",
#       "Check import directives"
#     ]
#   },
#   {
#     "type": "inconsistent_resolution",
#     "severity": "warning",
#     "message": "Variable 'config' resolves to different values in different contexts",
#     "contexts": ["template.meld", "imported.meld"],
#     "suggestions": [
#       "Check for variable shadowing",
#       "Verify import order is consistent"
#     ]
#   }
# ]
```

## Implementation Approach

### Phase 1: Command Enhancement (1 day)

1. Update existing debug command definitions
2. Add issue detection options to command handlers
3. Hook into the issue detection pipeline

### Phase 2: New Commands (1 day)

1. Implement the `debug-issues` command
2. Implement the `debug-analyze` command
3. Create command documentation and help text

### Phase 3: Output Formatting (1 day)

1. Implement text format with color support
2. Implement JSON format
3. Implement markdown format

## Acceptance Criteria

1. All commands accept and process appropriate issue detection flags
2. Output is properly formatted according to user-specified format
3. Colored output works correctly in terminals that support it
4. JSON output is valid and contains complete issue information
5. Command options and flags are consistent across commands
6. All commands include proper help text and documentation

## Estimated Effort

Total effort: **3 days**

- Command Enhancement: 1 day
- New Commands: 1 day
- Output Formatting: 1 day