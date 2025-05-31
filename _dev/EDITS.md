  1. Resolvers as Security Boundary - BRILLIANT!

  This is a game-changer for sandboxing:

  {
    "security": {
      "resolvers": {
        "allowCustom": false,  // No new resolvers
        "allowedResolvers": ["local", "github"],  // Whitelist
        "pathOnlyMode": true   // No filesystem access except via resolvers
      }
    },
    "registries": [
      {
        "prefix": "@data/",
        "resolver": "local",
        "config": {
          "path": "/sandbox/data",
          "readonly": true
        }
      }
    ]
  }

  2. Import Depth & Transitive Dependencies

  You're right - 3 levels is pragmatic. For registry:

  {
    "@alice/utils": {
      "source": "...",
      "hash": "abc123...",
      "dependencies": {
        "@bob/helpers": "def456...",
        "@charlie/core": "ghi789..."
      },
      "transitiveDependencies": {
        "@bob/helpers": {
          "@david/base": "jkl012..."
        }
      }
    }
  }

  3. Grammar Fix - No Angle Brackets

  # Correct syntax
  @import { x } from @author/module (1h) trust always
  @run [deploy.sh] trust never

  4. Path-Only Mode & Output Resolvers

  Your @output design is fantastic:

  # Output to resolver
  @output @result to @storage/reports/daily.json

  # Output to file (if allowed)
  @output @data to file [./output.xml] as xml

  # Output to command (if allowed)
  @exec upload(data) = @run [aws s3 cp - s3://bucket/]
  @output @report to @run @upload(@report)

  # Multiple outputs
  @output @summary to @logs/summary.txt
  @output @full to @archive/full-report.json

  Lock file config:
  {
    "registries": [
      {
        "prefix": "@storage/",
        "resolver": "s3",
        "config": {
          "bucket": "my-outputs",
          "permissions": ["write"]
        },
        "type": "output"  // Mark as output resolver
      }
    ]
  }

  5. Security Documentation Tone

  You're absolutely right. Here's the adjusted messaging:

  Before (Overconfident)

  mlld blocks command injection and data exfiltration attempts.

  After (Honest)

  mlld provides tools to help mitigate security risks:
  - Import approval and content hashing
  - Basic command pattern detection
  - Configurable security policies

  However, mlld is a powerful scripting language. Users are ultimately responsible for what they run and import. We provide
  guardrails, not guarantees.

  6. Audit Logs

  Should go in ~/.mlld/audit/:
  ~/.mlld/
  ├── audit/
  │   ├── 2024-01-15-imports.log
  │   ├── 2024-01-15-commands.log
  │   └── 2024-01-15-security.log

  7. Security Detection Confidence

  For v1, we should:
  - Build the architecture for security checks
  - Implement basic pattern detection
  - Be honest about limitations
  - Focus on user control over promises

  Updated Lock File Design

  {
    "version": 1,
    "security": {
      "policy": {
        "resolvers": {
          "allowCustom": true,
          "allowedTypes": ["local", "github", "http"],
          "pathOnlyMode": false
        },
        "commands": {
          "analyze": true,
          "requireApproval": ["rm", "curl", "wget"]
        },
        "imports": {
          "maxDepth": 3,
          "requireApproval": true
        }
      }
    },
    "registries": [
      {
        "prefix": "@input/",
        "resolver": "local",
        "type": "input",
        "config": { "path": "./data" }
      },
      {
        "prefix": "@output/",
        "resolver": "s3",
        "type": "output",
        "config": { "bucket": "results" }
      }
    ]
  }

  Documentation Updates Needed

  1. Add "Resolvers as Security Boundary" section
  2. Document @output directive
  3. Adjust security claims to be modest
  4. Add import depth configuration
  5. Document path-only mode
  6. Add audit log specification