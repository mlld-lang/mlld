/**
 * Demonstration of error display improvements showing before and after examples
 */
const chalk = require('chalk');

// Display header
console.log(chalk.bold.blue('==================================================='));
console.log(chalk.bold.blue('      Error Display Enhancement Demonstration       '));
console.log(chalk.bold.blue('==================================================='));
console.log();

// Example 1: Syntax error in JSON
console.log(chalk.bold.yellow('Example 1: Syntax Error in JSON'));
console.log(chalk.bold('Before:'));
console.log('Error in examples/error-test.meld:5: Parse error: Parse error: Expected "$", "'", "-", "@call", "@embed", "@run", "[", "[[", "\\"", "`", "false", "null", "true", "{", "{{", [0-9], or whitespace but "s" found. at line 5, column 13 in examples/error-test.meld');
console.log();

console.log(chalk.bold('After:'));
console.log(chalk.red.bold('Parse Error:') + ' Expected "$", "\\"", "{", or other valid token but "s" found.');
console.log(chalk.dim(`    at ${chalk.cyan('syntax-error.meld')}:${chalk.yellow('5')}:${chalk.yellow('13')}`));
console.log();
console.log(chalk.dim('   3 | ') + chalk.dim('@data invalid = {'));
console.log(chalk.dim('   4 | ') + chalk.dim('  "key": "value",'));
console.log(chalk.bold('   5 | ') + chalk.white('  "broken": ') + chalk.bgRed.white('s') + chalk.white('yntax error here'));
console.log('     | ' + ' '.repeat(12) + chalk.red('^'));
console.log(chalk.dim('   6 | ') + chalk.dim('}'));
console.log();
console.log(chalk.dim('The issue is a syntax error in the JSON data:'));
console.log(chalk.dim('- In JSON, values must be enclosed in quotes, numbers, or be true/false/null'));
console.log(chalk.dim('- Fix: Change `syntax error here` to `"syntax error here"`'));
console.log();

// Example 2: Import error
console.log(chalk.bold.yellow('Example 2: Import Error'));
console.log(chalk.bold('Before:'));
console.log('Error in examples/example.meld: Import error: Could not resolve file path "$./docs/UX.md" - file does not exist');
console.log();

console.log(chalk.bold('After:'));
console.log(chalk.red.bold('Import Error:') + ' Could not resolve file path "$/docs/UX.md" - file does not exist');
console.log(chalk.dim(`    at ${chalk.cyan('examples/example.meld')}:${chalk.yellow('23')}:${chalk.yellow('19')}`));
console.log();
console.log(chalk.dim('  21 | ') + chalk.dim('## Documentation'));
console.log(chalk.dim('  22 | ') + chalk.dim('### Target UX'));
console.log(chalk.bold('  23 | ') + chalk.white('@embed [$') + chalk.bgRed.white('./docs/U') + chalk.white('X.md]'));
console.log('     | ' + ' '.repeat(10) + chalk.red('^^^^^^^'));
console.log(chalk.dim('  24 | ') + chalk.dim('### Architecture'));
console.log(chalk.dim('  25 | ') + chalk.dim('@embed [$./docs/ARCHITECTURE.md]'));
console.log();
console.log(chalk.dim('The issue is that the path is incorrect. Options to fix:'));
console.log(chalk.dim('1. Check if the file exists at the expected location'));
console.log(chalk.dim('2. Use the correct project path: @embed [$./docs/UX.md]'));
console.log(chalk.dim('3. Use an absolute path if needed: @embed [$/absolute/path/to/UX.md]'));
console.log();

// Example 3: Resolution error
console.log(chalk.bold.yellow('Example 3: Resolution Error'));
console.log(chalk.bold('Before:'));
console.log('Error: Resolution failed: The variable "non_existent_var" is not defined');
console.log();

console.log(chalk.bold('After:'));
console.log(chalk.red.bold('Resolution Error:') + ' The variable "non_existent_var" is not defined');
console.log(chalk.dim(`    at ${chalk.cyan('examples/variable-test.meld')}:${chalk.yellow('12')}:${chalk.yellow('10')}`));
console.log();
console.log(chalk.dim('  10 | ') + chalk.dim('@text greeting = "Hello, world\!"'));
console.log(chalk.dim('  11 | '));
console.log(chalk.bold('  12 | ') + chalk.white('@run [echo {{') + chalk.bgRed.white('non_exis') + chalk.white('tent_var}}]'));
console.log('     | ' + ' '.repeat(17) + chalk.red('^^^^^^^'));
console.log(chalk.dim('  13 | '));
console.log();
console.log(chalk.dim('Variable: non_existent_var (text)'));
console.log(chalk.dim('Available variables:'));
console.log(chalk.dim('- text.greeting'));
console.log();

// Summary
console.log(chalk.bold.blue('==================================================='));
console.log(chalk.bold.blue('                     Summary                       '));
console.log(chalk.bold.blue('==================================================='));
console.log();
console.log('The enhanced error display provides:');
console.log('1. Clear error type and message');
console.log('2. File path, line number, and column information');
console.log('3. Source code context with lines before and after the error');
console.log('4. Visual highlighting of the exact error location');
console.log('5. Helpful suggestions for fixing common issues');
console.log('6. Error-specific details (variable names, available options, etc.)');
console.log();
console.log('These improvements make debugging much easier for users working with Meld files.');
