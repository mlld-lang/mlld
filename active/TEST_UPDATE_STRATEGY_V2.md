# Test Update Strategy V2 - Systematic Approach

## Overview
We need to update ~313 test files and ~43 example files to the new mlld syntax. This requires a careful, phased approach to avoid creating a mess.

## New Syntax Summary
1. `@` → `/` for directives
2. `[(command)]` → `{command}` for shell commands
3. `>>` → `//` for comments
4. Variable declarations: `/text name =` → `/text @name =`
5. **Critical**: Double quotes now interpolate `@variables` everywhere

## Phase-by-Phase Approach

### Phase 1: Single Comprehensive Script
Create ONE script that does ALL syntax transformations at once for each file:

```python
def update_file(content):
    # 1. Update directive markers
    content = update_directives(content)
    
    # 2. Update comments
    content = update_comments(content)
    
    # 3. Update variable declarations
    content = update_variable_declarations(content)
    
    # 4. Update command brackets
    content = update_command_brackets(content)
    
    # 5. Handle string interpolation
    content = update_string_interpolation(content)
    
    return content
```

### Phase 2: Categories of Files

#### A. Simple Syntax Updates (Low Risk)
Files that only need mechanical syntax changes:
- Comment-only files
- Simple variable assignments
- Basic commands

#### B. Command Bracket Updates (Medium Risk)
Files with shell commands needing bracket updates:
- Must preserve `[file.md]` for content loading
- Only update `[(command)]` patterns

#### C. String Interpolation Updates (High Risk)
Files where double-quote behavior changes:
- Text assignments with `@` in strings
- Data objects with string values
- Path assignments with dynamic segments

### Phase 3: Test Categories to Prioritize

1. **Keep Working As-Is** (minimal changes):
   - `tests/cases/valid/add/template/` - Uses `[[...]]` templates
   - `tests/cases/valid/comments/` - Simple comment syntax
   
2. **Need Careful Updates**:
   - `tests/cases/valid/text/` - Many string interpolation cases
   - `tests/cases/valid/data/` - Complex data structures
   - `tests/cases/valid/exec/` - Command definitions
   
3. **Need Semantic Review**:
   - Files using `"text with @var"` expecting literal output
   - Files using `[path/to/file]` for content loading

## Implementation Plan

### Step 1: Create Master Update Script
```python
#!/usr/bin/env python3
# update-to-new-syntax.py

import os
import re
import glob

class SyntaxUpdater:
    def __init__(self):
        self.changes = []
        
    def update_file(self, filepath):
        with open(filepath, 'r') as f:
            content = f.read()
            
        original = content
        
        # Apply all transformations
        content = self.update_directives(content)
        content = self.update_comments(content)
        content = self.update_variable_declarations(content)
        content = self.update_command_brackets(content)
        content = self.handle_string_interpolation(content)
        
        if content != original:
            with open(filepath, 'w') as f:
                f.write(content)
            self.changes.append(filepath)
            
    def update_directives(self, content):
        # Update @ to / at start of lines
        directives = ['text', 'run', 'add', 'import', 'data', 'exec', 'path', 'output', 'when']
        for d in directives:
            content = re.sub(f'^@{d}\\b', f'/{d}', content, flags=re.MULTILINE)
        return content
        
    def update_comments(self, content):
        # Update >> to //
        return re.sub(r'^>>', '//', content, flags=re.MULTILINE)
        
    def update_variable_declarations(self, content):
        # Add @ prefix to variable names in declarations
        # /text name = → /text @name =
        pattern = r'^(/(?:text|data|path|exec))\s+([a-zA-Z_]\w*)\s*='
        return re.sub(pattern, r'\1 @\2 =', content, flags=re.MULTILINE)
        
    def update_command_brackets(self, content):
        # Update [(command)] to {command}
        # But preserve [file] patterns
        content = re.sub(r'\[\((.*?)\)\]', r'{\1}', content, flags=re.DOTALL)
        return content
        
    def handle_string_interpolation(self, content):
        # This is the tricky part - we need to identify strings that
        # expect literal @variables and convert them to single quotes
        # For now, we'll flag these for manual review
        return content
```

### Step 2: Run in Test Mode First
1. Run script in dry-run mode to see what would change
2. Review a sample of changes
3. Identify problem patterns

### Step 3: Execute Updates
1. Create branch
2. Run update script
3. Rebuild fixtures
4. Run tests
5. Fix failures iteratively

### Step 4: Manual Review
1. Review string interpolation changes
2. Verify semantic preservation ([file] vs {command})
3. Update expected outputs

## Success Metrics
- All tests pass after updates
- No unintended semantic changes
- String interpolation behavior properly handled
- Clean git diff (no partial updates)

## Risk Mitigation
1. Work on small batches first
2. Keep original files as reference
3. Document all manual decisions
4. Create fix scripts for common issues