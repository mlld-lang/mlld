#!/usr/bin/env python3
"""
Fix multiline exec syntax issues where code appears outside braces.
"""

import os
import re
import glob

def fix_multiline_exec_format(content):
    """Fix exec declarations where the opening brace has code on same line."""
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if this is an exec with language and code on same line as opening brace
        # Pattern: /exec @name(...) = language {code}
        match = re.match(r'^(/exec\s+@\w+.*?=\s*(?:js|javascript|node|bash|sh|python)\s*\{)(.+)', line)
        if match:
            # Split the line - put code on next line
            prefix = match.group(1)
            code = match.group(2)
            
            # If code is just a comment, move it to next line
            fixed_lines.append(prefix)
            fixed_lines.append('  ' + code)
            i += 1
            continue
        
        fixed_lines.append(line)
        i += 1
    
    return '\n'.join(fixed_lines)

def fix_exec_code_alignment(content):
    """Ensure all lines between exec opening and closing braces are properly indented."""
    lines = content.split('\n')
    fixed_lines = []
    in_exec = False
    exec_indent = 0
    
    for line in lines:
        # Check if we're starting an exec block
        if re.match(r'^/exec\s+@\w+.*?=\s*(?:js|javascript|node|bash|sh|python)\s*\{', line):
            in_exec = True
            exec_indent = 2  # Standard indent for exec content
            fixed_lines.append(line)
        elif in_exec:
            # Check if this line closes the exec block
            if line.strip() == '}':
                in_exec = False
                fixed_lines.append('}')  # Closing brace at column 0
            elif line.strip():  # Non-empty line
                # Ensure proper indentation
                stripped = line.lstrip()
                if not stripped.startswith('//') and not stripped.startswith('/*'):
                    # Code line - ensure it has proper indent
                    fixed_lines.append('  ' + stripped)
                else:
                    # Comment - preserve as is or add indent
                    if line.startswith('  '):
                        fixed_lines.append(line)
                    else:
                        fixed_lines.append('  ' + stripped)
            else:
                fixed_lines.append(line)  # Preserve empty lines
        else:
            fixed_lines.append(line)
    
    return '\n'.join(fixed_lines)

def main():
    """Fix multiline exec syntax in all files."""
    patterns = [
        "tests/cases/**/*.md",
        "tests/cases/**/*.mld", 
        "examples/**/*.mld",
        "examples/**/*.md"
    ]
    
    fixed_files = []
    
    for pattern in patterns:
        files = glob.glob(pattern, recursive=True)
        for filepath in files:
            try:
                with open(filepath, 'r') as f:
                    content = f.read()
                
                original = content
                content = fix_multiline_exec_format(content)
                content = fix_exec_code_alignment(content)
                
                if content != original:
                    with open(filepath, 'w') as f:
                        f.write(content)
                    fixed_files.append(filepath)
                    print(f"Fixed: {filepath}")
            except Exception as e:
                print(f"Error processing {filepath}: {e}")
    
    print(f"\nFixed {len(fixed_files)} files")

if __name__ == '__main__':
    main()