/**
 * IMMUTABLE SECURITY PATTERNS
 * 
 * These patterns CANNOT be modified by any mlld script.
 * They represent the absolute minimum security boundaries.
 */

export const IMMUTABLE_SECURITY_PATTERNS = Object.freeze({
  // Paths that can NEVER be read
  protectedReadPaths: Object.freeze([
    '~/.ssh/**',           // SSH keys
    '~/.aws/**',           // AWS credentials
    '~/.gnupg/**',         // GPG keys
    '~/.docker/config.json', // Docker auth
    '~/.kube/config',      // Kubernetes config
    '~/.npmrc',            // NPM tokens
    '~/.netrc',            // Network credentials
    '~/.git-credentials',  // Git credentials
    '~/.env*',             // Environment files
    '**/.env*',            // Any env files
    '**/secrets/**',       // Secrets directories
    '**/private/**',       // Private directories
    '/etc/shadow',         // System passwords
    '/etc/sudoers',        // Sudo config
    'C:\\Windows\\System32\\config\\**' // Windows SAM
  ]),
  
  // Paths that can NEVER be written
  protectedWritePaths: Object.freeze([
    '~/.mlld/**',          // Our own security config!
    'mlld.lock.json',      // Lock file integrity
    '**/mlld.lock.json',   // Lock file in any location
    '/etc/**',             // System config
    '/usr/**',             // System binaries
    '/bin/**',             // System binaries
    '/sbin/**',            // System binaries
    '/System/**',          // macOS system
    '/Library/**',         // macOS system
    'C:\\Windows\\**',     // Windows system
    'C:\\Program Files\\**', // Windows programs
    '/proc/**',            // Linux proc
    '/sys/**',             // Linux sys
    '/dev/**'              // Device files
  ]),
  
  // Commands that are ALWAYS blocked
  blockedCommands: Object.freeze([
    'rm -rf /',            // Delete root
    'rm -rf /*',           // Delete everything
    ':(){ :|:& };:',       // Fork bomb
    'dd if=/dev/zero of=/dev/sda', // Wipe disk
    'mkfs',                // Format filesystem
    '> /dev/sda',          // Overwrite disk
    'format c:',           // Format Windows
  ]),
  
  // Shell injection patterns (OWASP)
  injectionPatterns: Object.freeze([
    /;/,                   // Command separator
    /&&/,                  // Command chaining
    /\|\|/,                // Conditional execution
    /\|/,                  // Pipe
    /\$\(/,                // Command substitution
    /`/,                   // Backtick substitution
    />/,                   // Output redirection
    />>/,                  // Append redirection
    /</,                   // Input redirection
    /\n|\r/,               // Newline injection
    /\${.*}/,              // Variable expansion
  ]),
  
  // Patterns indicating data exfiltration
  exfiltrationPatterns: Object.freeze([
    /curl.*\.ssh/i,        // Exfiltrating SSH keys
    /wget.*\.aws/i,        // Exfiltrating AWS creds
    /nc.*\.env/i,          // Exfiltrating env files
    /base64.*\.pem/i,      // Encoding certificates
    /cat.*\|.*curl/i,      // Classic exfiltration
    /cat.*\|.*nc/i,        // Netcat exfiltration
  ]),
  
  // LLM command patterns to detect
  llmCommandPatterns: Object.freeze([
    /^(claude|anthropic|ai)/i,
    /^(gpt|openai|chatgpt)/i,
    /^(llm|ai-|ml-)/i,
    /^(bard|gemini|palm)/i,
    /^(mistral|llama|alpaca)/i,
  ])
});

// Type-safe access
export type ImmutablePatterns = typeof IMMUTABLE_SECURITY_PATTERNS;