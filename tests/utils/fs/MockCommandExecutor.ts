/**
 * Utility for mocking command execution in tests
 * 
 * This utility provides a flexible way to mock command execution
 * with pattern matching and configurable responses.
 */

/**
 * Response structure for mock command execution
 */
export interface CommandResponse {
  stdout: string;
  stderr: string;
  exitCode?: number;
}

/**
 * Command mapping configuration for the MockCommandExecutor
 */
export type CommandMapping = {
  // Exact command match
  [command: string]: CommandResponse;
} & {
  // RegExp patterns for flexible matching
  patterns?: Array<{
    pattern: RegExp;
    response: CommandResponse;
  }>;
  // Default response for any unmatched command
  default?: CommandResponse;
}

/**
 * Handles mocking of command execution for tests
 * Provides flexible pattern matching and configurable responses
 */
export class MockCommandExecutor {
  private mapping: CommandMapping = {
    patterns: [],
    default: {
      stdout: '',
      stderr: 'Command not found or not supported in test environment',
      exitCode: 127
    }
  };

  /**
   * Creates a new MockCommandExecutor
   * @param initialMapping Optional initial command mapping
   */
  constructor(initialMapping?: CommandMapping) {
    if (initialMapping) {
      this.setMapping(initialMapping);
    }
  }

  /**
   * Set the command mapping configuration
   * @param mapping Command mapping configuration
   */
  setMapping(mapping: CommandMapping): void {
    this.mapping = {
      ...mapping,
      patterns: mapping.patterns || [],
      default: mapping.default || this.mapping.default
    };
  }

  /**
   * Add a response for an exact command match
   * @param command The exact command to match
   * @param response The response to return
   */
  addCommandResponse(command: string, response: CommandResponse): void {
    this.mapping[command] = response;
  }

  /**
   * Add a response for a command pattern
   * @param pattern Regular expression to match against commands
   * @param response The response to return
   */
  addCommandPattern(pattern: RegExp, response: CommandResponse): void {
    if (!this.mapping.patterns) {
      this.mapping.patterns = [];
    }
    this.mapping.patterns.push({ pattern, response });
  }

  /**
   * Set the default response for unmatched commands
   * @param response Default response
   */
  setDefaultResponse(response: CommandResponse): void {
    this.mapping.default = response;
  }

  /**
   * Reset all command mappings
   */
  reset(): void {
    this.mapping = {
      patterns: [],
      default: {
        stdout: '',
        stderr: 'Command not found or not supported in test environment',
        exitCode: 127
      }
    };
  }

  /**
   * Execute a command against the mock mappings
   * @param command The command to execute
   * @param options Execution options like current working directory
   * @returns Command response with stdout, stderr, and optional exitCode
   */
  async executeCommand(command: string, options?: { cwd?: string }): Promise<CommandResponse> {
    // First check for exact match
    if (this.mapping[command]) {
      return this.mapping[command];
    }

    // Then check for pattern matches
    if (this.mapping.patterns) {
      for (const { pattern, response } of this.mapping.patterns) {
        if (pattern.test(command)) {
          // For pattern matches, allow for capture group substitution in the response
          const match = command.match(pattern);
          if (match) {
            return {
              stdout: this.substituteCaptures(response.stdout, match),
              stderr: this.substituteCaptures(response.stderr, match),
              exitCode: response.exitCode
            };
          }
          return response;
        }
      }
    }

    // Default response if no match found
    return this.mapping.default || {
      stdout: '',
      stderr: `Command not supported in test environment: ${command}`,
      exitCode: 127
    };
  }

  /**
   * Replace capture group references in response strings
   * @param text Text with potential $1, $2, etc. references
   * @param match The RegExp match results
   * @returns Text with substituted values
   */
  private substituteCaptures(text: string, match: RegExpMatchArray): string {
    return text.replace(/\$(\d+)/g, (_, index) => {
      const captureIndex = parseInt(index, 10);
      return captureIndex < match.length ? match[captureIndex] : '';
    });
  }
}

/**
 * Creates common command mappings for test environments
 */
export function createCommonCommandMappings(): CommandMapping {
  return {
    // Echo commands
    patterns: [
      {
        pattern: /^echo\s+(.*)$/i,
        response: {
          stdout: '$1',
          stderr: '',
          exitCode: 0
        }
      },
      // ls command (basic simulation)
      {
        pattern: /^ls\s+(.*)$/i,
        response: {
          stdout: 'file1.txt\nfile2.txt\ndirectory1\n',
          stderr: '',
          exitCode: 0
        }
      },
      // npm commands
      {
        pattern: /^npm\s+run\s+(.*)$/i,
        response: {
          stdout: 'Running script $1...\nDone!',
          stderr: '',
          exitCode: 0
        }
      },
      // git commands
      {
        pattern: /^git\s+(.*)$/i,
        response: {
          stdout: 'Git operation: $1',
          stderr: '',
          exitCode: 0
        }
      }
    ],
    default: {
      stdout: '',
      stderr: 'Command not supported in test environment',
      exitCode: 1
    }
  };
}