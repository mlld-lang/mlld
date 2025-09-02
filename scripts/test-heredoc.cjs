#!/usr/bin/env node

/**
 * Test script for heredoc functionality in BashExecutor
 * Tests the handling of large environment variables via heredocs
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  dim: (msg) => console.log(`${colors.dim}${msg}${colors.reset}`)
};

// Test configuration
const TEST_DIR = path.join(os.tmpdir(), 'mlld-heredoc-test-' + Date.now());
const MLLD_BIN = path.join(__dirname, '..', 'dist', 'cli.cjs');

// Ensure mlld is built
if (!fs.existsSync(MLLD_BIN)) {
  log.error('mlld CLI not found. Please run: npm run build');
  process.exit(1);
}

// Create test directory
fs.mkdirSync(TEST_DIR, { recursive: true });
log.info(`Test directory: ${TEST_DIR}`);

// Helper to create test files
function createTestFile(name, content) {
  const filepath = path.join(TEST_DIR, name);
  fs.writeFileSync(filepath, content);
  return filepath;
}

// Helper to run mlld with options
function runMlld(scriptPath, env = {}) {
  // Allow absolute paths for tests that write/read from /tmp
  const args = [MLLD_BIN, '--allow-absolute', scriptPath];
  const result = spawnSync('node', args, {
    cwd: TEST_DIR,
    env: { 
      ...process.env, 
      MLLD_BASH_HEREDOC: process.env.MLLD_BASH_HEREDOC || '1',
      MLLD_DEBUG_BASH_SCRIPT: process.env.MLLD_DEBUG_BASH_SCRIPT || '1',
      ...env 
    },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
  });
  
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    error: result.error
  };
}

// Test cases
const tests = [];

// Test 1: Basic functionality without heredoc
tests.push({
  name: 'Small variable without heredoc',
  env: { MLLD_BASH_HEREDOC: '0' },
  script: `
/var @data = "Hello World"
/exe @echo(msg) = sh {
  echo "Received: $msg"
}
/show @echo(@data)
`,
  expected: 'Received: Hello World',
  shouldPass: true
});

// Test 2: Large variable without heredoc (should work since we're under the limit)
tests.push({
  name: 'Medium variable (100KB) without heredoc',
  env: { MLLD_BASH_HEREDOC: '0' },
  script: `
/var @data = \`${'x'.repeat(100000)}\`
/exe @count(msg) = sh {
  echo "Length: $(echo -n \"$msg\" | wc -c | tr -d '[:space:]')"
}
/show @count(@data)
`,
  expected: 'Length: 100000',
  shouldPass: true
});

// Test 3: Large variable with heredoc enabled
tests.push({
  name: 'Large variable (200KB) with heredoc',
  env: { 
    MLLD_BASH_HEREDOC: '1',
    MLLD_MAX_BASH_ENV_VAR_SIZE: '131072' // 128KB threshold
  },
  script: `
/var @data = \`${'y'.repeat(200000)}\`
/exe @verify(content) = sh {
  echo "Length: $(echo -n \"$content\" | wc -c | tr -d '[:space:]')"
  echo "First char: $(echo -n "$content" | head -c 1)"
  echo "Last char: $(echo -n "$content" | tail -c 1)"
}
/show @verify(@data)
`,
  expected: ['Length: 200000', 'First char: y', 'Last char: y'],
  shouldPass: true
});

// Test 4: Multiple large variables with heredoc
tests.push({
  name: 'Multiple large variables with heredoc',
  env: { 
    MLLD_BASH_HEREDOC: '1',
    MLLD_MAX_BASH_ENV_VAR_SIZE: '65536' // 64KB threshold
  },
  script: `
/var @data1 = \`${'a'.repeat(70000)}\`
/var @data2 = \`${'b'.repeat(70000)}\`
/var @data3 = \`${'c'.repeat(70000)}\`
/exe @multi(x, y, z) = sh {
  echo "X length: $(echo -n \"$x\" | wc -c | tr -d '[:space:]')"
  echo "Y length: $(echo -n \"$y\" | wc -c | tr -d '[:space:]')"
  echo "Z length: $(echo -n \"$z\" | wc -c | tr -d '[:space:]')"
  echo "X char: $(echo -n "$x" | head -c 1)"
  echo "Y char: $(echo -n "$y" | head -c 1)"
  echo "Z char: $(echo -n "$z" | head -c 1)"
}
/show @multi(@data1, @data2, @data3)
`,
  expected: [
    'X length: 70000',
    'Y length: 70000', 
    'Z length: 70000',
    'X char: a',
    'Y char: b',
    'Z char: c'
  ],
  shouldPass: true
});

// Test 5: Debug output verification
tests.push({
  name: 'Debug output shows heredoc usage',
  env: { 
    MLLD_BASH_HEREDOC: '1',
    MLLD_DEBUG: 'true',
    MLLD_MAX_BASH_ENV_VAR_SIZE: '1000' // Very low threshold
  },
  script: `
/var @data = \`${'z'.repeat(2000)}\`
/exe @test(msg) = sh {
  echo "Got it"
}
/show @test(@data)
`,
  expected: 'Got it',
  shouldPass: true,
  checkStderr: true,
  stderrContains: '[BashExecutor] Using heredoc'
});

// Test 6: Content with potential EOF marker collision
tests.push({
  name: 'Content with EOF-like strings',
  env: { 
    MLLD_BASH_HEREDOC: '1',
    MLLD_MAX_BASH_ENV_VAR_SIZE: '100'
  },
  script: `
/var @data = \`${'x'.repeat(50)}MLLD_EOF_test${'y'.repeat(50)}\`
/exe @check(content) = sh {
  echo "Length: $(echo -n \"$content\" | wc -c | tr -d '[:space:]')"
  echo "Contains marker: $(echo "$content" | grep -o "MLLD_EOF_test" || echo "not found")"
}
/show @check(@data)
`,
  expected: ['Length: 113', 'Contains marker: MLLD_EOF_test'],
  shouldPass: true
});

// Test 7: Extremely large variable (1MB) with heredoc
tests.push({
  name: 'Very large variable (1MB) with heredoc',
  env: { 
    MLLD_BASH_HEREDOC: '1',
    MLLD_MAX_BASH_ENV_VAR_SIZE: '131072'
  },
  script: `
/var @huge = \`${'m'.repeat(1000000)}\`
/exe @process(data) = sh {
  echo "Size: $(echo -n \"$data\" | wc -c | tr -d '[:space:]')"
  echo "MD5: $(echo -n "$data" | md5sum | cut -d' ' -f1)"
}
/show @process(@huge)
`,
  expected: (output) => {
    // Check size is correct
    if (!output.includes('Size: 1000000')) return false;
    // MD5 of 1M 'm' characters should be consistent
    if (!output.includes('MD5: ')) return false;
    return true;
  },
  shouldPass: true
});

// Test 7.5: Bare {} exec with large variable should fallback to heredoc
tests.push({
  name: 'Bare {} exec with large variable uses fallback',
  env: {
    MLLD_BASH_HEREDOC: '1',
    MLLD_MAX_BASH_ENV_VAR_SIZE: '131072'
  },
  script: `
/var @huge = \`${'n'.repeat(200000)}\`
/exe @echo_it2(big) = { echo @big bar }
/show @echo_it2(@huge)
`,
  expected: (output) => output.includes(' bar'),
  shouldPass: true
});

// Test 8: Load from file and pass to bash
tests.push({
  name: 'Load large file and process with heredoc',
  env: { 
    MLLD_BASH_HEREDOC: '1',
    MLLD_MAX_BASH_ENV_VAR_SIZE: '65536'
  },
  setup: () => {
    // Create a large test file
    const content = 'test'.repeat(50000); // 200KB
    createTestFile('large.txt', content);
  },
  script: `
/var @filedata = <large.txt>
/exe @analyze(content) = sh {
  echo "File size: $(echo -n \"$content\" | wc -c | tr -d '[:space:]')"
  echo "First word: $(echo "$content" | head -c 4)"
}
/show @analyze(@filedata)
`,
  expected: ['File size: 200000', 'First word: test'],
  shouldPass: true
});

// Run tests
console.log(`\n${colors.cyan}═══ Heredoc Feature Tests ═══${colors.reset}\n`);

let passed = 0;
let failed = 0;

for (const test of tests) {
  // Setup if needed
  if (test.setup) {
    test.setup();
  }
  
  // Create test script
  const scriptPath = createTestFile(`test-${Date.now()}.mld`, test.script);
  
  // Run test
  log.dim(`Running: ${test.name}`);
  const result = runMlld(scriptPath, test.env);
  
  // Check result
  let success = false;
  const output = result.stdout.trim();
  const stderr = result.stderr;
  
  if (test.shouldPass && result.status === 0) {
    if (typeof test.expected === 'function') {
      success = test.expected(output);
    } else if (Array.isArray(test.expected)) {
      success = test.expected.every(exp => output.includes(exp));
    } else {
      success = output.includes(test.expected);
    }
    
    // Check stderr if needed
    if (success && test.checkStderr && test.stderrContains) {
      success = stderr.includes(test.stderrContains);
      if (!success) {
        log.dim(`  Expected stderr to contain: ${test.stderrContains}`);
        log.dim(`  Actual stderr: ${stderr.substring(0, 200)}`);
      }
    }
  } else if (!test.shouldPass && result.status !== 0) {
    success = true;
  }
  
  if (success) {
    log.success(test.name);
    passed++;
  } else {
    log.error(test.name);
    log.dim(`  Expected: ${Array.isArray(test.expected) ? test.expected.join(', ') : test.expected}`);
    log.dim(`  Got: ${output.substring(0, 200)}${output.length > 200 ? '...' : ''}`);
    if (result.status !== 0) {
      log.dim(`  Exit code: ${result.status}`);
      if (stderr) {
        log.dim(`  Stderr: ${stderr.substring(0, 200)}`);
      }
    }
    failed++;
  }
}

// Test the actual issue from #404
console.log(`\n${colors.cyan}═══ Issue #404 Regression Test ═══${colors.reset}\n`);

const issue404Script = `
# Original issue: 215KB variable passed to bash
/run sh {
  head -c 215920 < /dev/zero | tr '\\0' 'a' > /tmp/issue404.txt
}
/var @file = </tmp/issue404.txt>
/var @content = \`@file.content\`
/exe @echo_it(big_arg) = sh {
  echo "why doesn't this echo show?"
}
/show @echo_it(@content)
/run {rm -f /tmp/issue404.txt}
`;

log.info('Testing original issue #404 scenario...');

// Test without heredoc (should fail or have issues)
const issue404Path = createTestFile('issue404.mld', issue404Script);
log.dim('Without heredoc (might fail):');
const withoutHeredoc = runMlld(issue404Path, { MLLD_BASH_HEREDOC: '0' });
if (withoutHeredoc.status !== 0 || !withoutHeredoc.stdout.includes("why doesn't this echo show?")) {
  log.warn('Failed without heredoc (expected)');
} else {
  log.success('Worked without heredoc (system might have high limits)');
}

// Test with heredoc (should work)
log.dim('With heredoc enabled:');
const withHeredoc = runMlld(issue404Path, { MLLD_BASH_HEREDOC: '1' });
if (withHeredoc.status === 0 && withHeredoc.stdout.includes("why doesn't this echo show?")) {
  log.success('Issue #404 fixed with heredoc!');
  passed++;
} else {
  log.error('Issue #404 still failing with heredoc');
  log.dim(`  Output: ${withHeredoc.stdout}`);
  log.dim(`  Stderr: ${withHeredoc.stderr}`);
  failed++;
}

// Cleanup
try {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  log.dim(`\nCleaned up test directory`);
} catch (e) {
  log.warn(`Could not clean up ${TEST_DIR}: ${e.message}`);
}

// Summary
console.log(`\n${colors.cyan}═══ Test Summary ═══${colors.reset}`);
console.log(`${colors.green}Passed:${colors.reset} ${passed}`);
console.log(`${colors.red}Failed:${colors.reset} ${failed}`);

if (failed === 0) {
  console.log(`\n${colors.green}✓ All tests passed!${colors.reset}`);
  process.exit(0);
} else {
  console.log(`\n${colors.red}✗ Some tests failed${colors.reset}`);
  process.exit(1);
}
