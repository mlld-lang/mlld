# Managing AI Tool Files in the Repository

## The Problem

AI development tools have hardcoded paths where they look for configuration:
- `CLAUDE.md` - Must be in root for Claude
- `.cursorrules` - Must be in root for Cursor
- `.aidigestignore` - Must be in root for AI Digest
- Various other tool-specific locations

We can't move these files without breaking the tools.

## Solution: Embrace Organized Messiness

### 1. Use Clear Naming Conventions
All AI-related files should have obvious names:
- Start with tool name: `CLAUDE.md`, not `instructions.md`
- Use CAPS for visibility: `AGENTS.md`, not `agents.md`
- Group in listings: `.cursorrules` next to `.aidigestignore`

### 2. Add README Section
```markdown
## Development Setup

This repository includes configuration files for AI-powered development tools:
- `CLAUDE.md` - Instructions for Claude AI assistant
- `.cursorrules` - Configuration for Cursor IDE
- `AGENTS.md` - General AI agent instructions

These files are excluded from the npm package but kept in the repository
to aid contributors using AI-powered development tools.
```

### 3. Use .gitignore for Personal Variations
```gitignore
# AI tool personal overrides
CLAUDE.local.md
.cursorrules.local
*.personal.md

# AI tool generated files
.continue/
.aider/
.claude_chat_history
```

### 4. Create AI Config Documentation
Add to `docs/dev/AI-TOOLS.md`:
- Which tools are configured
- What each config file does
- How to customize for personal use

## Why This Approach Works

1. **Tools Work** - No fighting hardcoded paths
2. **Discoverable** - Clear names and documentation
3. **Ignorable** - Easy for non-AI users to ignore
4. **Standard** - Many projects now include these files

## Examples from Other Projects

### Projects Including AI Configs:
- **Langchain** - Includes `.cursorrules` and AI configs
- **AutoGPT** - Has AI tool configurations  
- **Many YC Startups** - Include CLAUDE.md or similar

### The New Normal:
AI-assisted development is becoming standard. These files are like:
- `.vscode/` settings
- `.idea/` for IntelliJ
- `.editorconfig`

## The Nuclear Option: Symlinks

If you really hate root clutter, you could:
```bash
mkdir .dev
mv CLAUDE.md .dev/
ln -s .dev/CLAUDE.md CLAUDE.md
```

But this:
- Doesn't work well on Windows
- Can confuse git
- Adds complexity for little benefit

## Recommendation

1. **Accept the root files** - It's the new normal
2. **Document them clearly** - Add README section
3. **Use package.json files** - Keep them out of npm
4. **Set a standard** - Be consistent in naming

The repository root is going to be messier in the AI age. That's okay.