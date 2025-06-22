#!/usr/bin/env python3
"""
Fix broken bracket conversions from the initial update script.
"""

import os
import re
import glob
import sys

def fix_broken_jq_commands(content):
    """Fix broken jq commands like '[.[}' that should be '[.[]'."""
    # Fix '[.[}' -> '[.[]'
    content = re.sub(r'\[\.\[\}', '[.[]', content)
    return content

def fix_unclosed_exec_commands(content):
    """Fix exec commands that are missing closing brackets."""
    lines = content.split('\n')
    fixed_lines = []
    
    for i, line in enumerate(lines):
        # Check if line starts with /exec and contains an opening {
        if line.startswith('/exec') and '{' in line and '}' not in line:
            # Look for the closing bracket on the next line or add it
            if i + 1 < len(lines) and '}' not in lines[i + 1]:
                # Add closing bracket
                line = line.rstrip() + '}'
        fixed_lines.append(line)
    
    return '\n'.join(fixed_lines)

def fix_exec_missing_at_prefix(content):
    """Fix exec declarations missing @ prefix on function name."""
    # Match: /exec funcname(...) = 
    # Should be: /exec @funcname(...) =
    pattern = r'^(/exec)\s+([a-zA-Z_]\w*)(\s*\()'
    def replacer(match):
        prefix = match.group(1)
        name = match.group(2)
        paren = match.group(3)
        # Check if name already has @ prefix
        if not name.startswith('@'):
            return f'{prefix} @{name}{paren}'
        return match.group(0)
    
    content = re.sub(pattern, replacer, content, flags=re.MULTILINE)
    return content

def fix_file(filepath):
    """Fix a single file."""
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        
        original = content
        
        # Apply fixes
        content = fix_broken_jq_commands(content)
        content = fix_unclosed_exec_commands(content)
        content = fix_exec_missing_at_prefix(content)
        
        if content != original:
            with open(filepath, 'w') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"Error processing {filepath}: {e}")
        return False

def main():
    """Fix all mlld files."""
    patterns = [
        "tests/cases/**/*.md",
        "tests/cases/**/*.mld", 
        "examples/**/*.mld",
        "examples/**/*.md"
    ]
    
    fixed_count = 0
    total_count = 0
    
    for pattern in patterns:
        files = glob.glob(pattern, recursive=True)
        for filepath in files:
            total_count += 1
            if fix_file(filepath):
                fixed_count += 1
                print(f"Fixed: {filepath}")
    
    print(f"\nFixed {fixed_count} out of {total_count} files")

if __name__ == '__main__':
    main()