// COMMAND BASE DETECTION PATTERNS
// Patterns for detecting command executables in shell commands

/* 
# Command Base Detection

This file provides patterns to detect command bases (executables) in shell commands
for security authorization purposes. It identifies:
- Simple commands (first word)
- Commands after operators (|, &&, ||, ;)
- Script runners (npm run, yarn run, etc.)
- Special patterns (python -m, node -e, etc.)
*/

// -------------------------------------------------------------
// COMMAND WITH BASE DETECTION - Main entry point
// -------------------------------------------------------------

// Parse command with base detection
CommandWithBases
  = segments:CommandSegmentList {
      const allParts = [];
      const bases = [];
      const rawBases = [];
      let hasScriptRunner = false;
      let hasVariables = false;
      
      // Process segments
      segments.forEach(segment => {
        if (segment.type === 'commandBase') {
          bases.push(segment.node);
          rawBases.push(segment.raw);
          allParts.push(segment.node);
          if (segment.isScriptRunner) {
            hasScriptRunner = true;
          }
        } else if (segment.type === 'operator') {
          allParts.push(segment.node);
        } else if (segment.type === 'argument') {
          allParts.push(...segment.parts);
          if (segment.hasVariables) {
            hasVariables = true;
          }
        }
      });
      
      // Reconstruct raw command
      const raw = helpers.reconstructRawString(allParts);
      
      return {
        parts: allParts,
        raw,
        bases,
        rawBases,
        hasVariables,
        hasScriptRunner
      };
    }

// -------------------------------------------------------------
// COMMAND SEGMENT LIST - Parse segments with operators
// -------------------------------------------------------------

// Command segment list with operators
CommandSegmentList
  = first:CommandPipeline rest:(op:CommandOperator _ pipeline:CommandPipeline { 
      return [{ type: 'operator', node: op }, ...pipeline]; 
    })* {
      return [first, ...rest].flat();
    }

// Command operators
CommandOperator
  = op:$("|" / "&&" / "||" / ";") {
      return helpers.createNode(NodeType.CommandOperator, { 
        operator: op.trim(), 
        location: location() 
      });
    }

// -------------------------------------------------------------
// COMMAND PIPELINE - Single command with arguments
// -------------------------------------------------------------

// Single pipeline segment  
CommandPipeline
  = base:CommandBaseDetection args:CommandArguments? {
      const result = [base];
      if (args) {
        result.push({
          type: 'argument',
          parts: args.parts,
          hasVariables: args.hasVariables
        });
      }
      return result;
    }

// Command arguments (everything after the base)
CommandArguments
  = _ parts:CommandArgumentParts {
      return parts;
    }

// Parse command arguments with variable support
CommandArgumentParts
  = parts:(CommandVariableRef / CommandArgumentText)+ {
      const hasVariables = parts.some(p => p.type === NodeType.VariableReference);
      return { parts, hasVariables };
    }

// Variable reference in command arguments
CommandVariableRef
  = "@" varName:BaseIdentifier {
      return helpers.createVariableReferenceNode('varIdentifier', { 
        identifier: varName,
        location: location()
      });
    }

// Text in command arguments (excluding operator characters)
CommandArgumentText
  = chars:$([ \t]* [^@|&;[\]\n \t]+ [ \t]*) {
      return helpers.createNode(NodeType.Text, { 
        content: chars, 
        location: location() 
      });
    }

// -------------------------------------------------------------
// COMMAND BASE DETECTION - Identify command executables
// -------------------------------------------------------------

// Detect command base
CommandBaseDetection
  = ScriptRunnerCommand  // npm run, yarn run, etc.
  / SpecialCommand       // python -m, node -e, etc.
  / SimpleCommand        // Regular commands

// -------------------------------------------------------------
// SCRIPT RUNNER PATTERNS
// -------------------------------------------------------------

// Script runner patterns (npm run, yarn run, etc.)
ScriptRunnerCommand
  = runner:PackageManager _ "run" _ script:ScriptName {
      const command = runner + " run";
      return {
        type: 'commandBase',
        node: helpers.createNode(NodeType.CommandBase, {
          type: NodeType.CommandBase,
          command: command,
          script: script,
          isScriptRunner: true,
          location: location()
        }),
        raw: command + " " + script,
        isScriptRunner: true
      };
    }
  / "npx" _ pkg:PackageName {
      return {
        type: 'commandBase',
        node: helpers.createNode(NodeType.CommandBase, {
          command: "npx",
          package: pkg,
          isPackageRunner: true,
          location: location()
        }),
        raw: "npx " + pkg,
        isScriptRunner: true
      };
    }

// Package managers
PackageManager
  = "npm" / "yarn" / "pnpm" / "bun"

// Script name (allows dashes and colons)
ScriptName
  = $([a-zA-Z0-9_-]+ (":" [a-zA-Z0-9_-]+)*)

// Package name (allows scoped packages)
PackageName
  = $("@" [a-zA-Z0-9_-]+ "/" [a-zA-Z0-9_-]+)  // Scoped package
  / $([a-zA-Z0-9_-]+)                          // Regular package

// -------------------------------------------------------------
// SPECIAL COMMAND PATTERNS
// -------------------------------------------------------------

// Special command patterns
SpecialCommand
  = lang:PythonCommand _ "-m" _ mod:CommandModuleName {
      const command = lang + " -m";
      return {
        type: 'commandBase',
        node: helpers.createNode(NodeType.CommandBase, {
          command: command,
          module: mod,
          location: location()
        }),
        raw: command + " " + mod
      };
    }
  / cmd:ShellCommand _ flag:InlineFlag {
      const command = cmd + " " + flag;
      return {
        type: 'commandBase',
        node: helpers.createNode(NodeType.CommandBase, {
          command: command,
          isInlineCode: true,
          location: location()
        }),
        raw: command
      };
    }
  / tool:BuildTool _ target:BuildTarget {
      // For now, treat build targets as regular commands
      return {
        type: 'commandBase',
        node: helpers.createNode(NodeType.CommandBase, {
          command: tool,
          location: location()
        }),
        raw: tool
      };
    }

// Python commands
PythonCommand
  = "python" / "python3" / "python2"

// Module name (allows dots)
CommandModuleName
  = $([a-zA-Z_][a-zA-Z0-9_]* ("." [a-zA-Z_][a-zA-Z0-9_]*)*)

// Shell commands that support inline execution
ShellCommand
  = "node" / "sh" / "bash" / "zsh" / "perl" / "ruby"

// Inline execution flags
InlineFlag
  = "-e" / "-c"

// Build tools
BuildTool
  = "make" / "cargo" / "go" / "gradle" / "maven" / "mvn" / "rake"

// Build target (first word after tool)
BuildTarget
  = $([a-zA-Z0-9_:-]+)

// -------------------------------------------------------------
// SIMPLE COMMAND - Default case
// -------------------------------------------------------------

// Simple command (first word)
SimpleCommand
  = cmd:CommandWord {
      return {
        type: 'commandBase',
        node: helpers.createNode(NodeType.CommandBase, {
          command: cmd,
          location: location()
        }),
        raw: cmd
      };
    }

// Command word (executable name)
CommandWord
  = $([a-zA-Z0-9_./-]+)