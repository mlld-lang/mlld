#!/usr/bin/env python3
"""
Fix multiline command issues from syntax conversion.
"""

import os
import re
import glob

def fix_multiline_exec_commands(content):
    """Fix exec commands that span multiple lines."""
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if this is an exec command with an opening brace
        if line.strip().startswith('/exec') and '{' in line and '}' not in line:
            # Collect lines until we find what looks like the end of the command
            command_lines = [line]
            j = i + 1
            
            # Look for lines that are part of the command (start with 'echo' or similar)
            while j < len(lines):
                next_line = lines[j]
                # If line starts with echo, it's part of the command
                if next_line.strip().startswith('echo '):
                    command_lines.append(next_line)
                    j += 1
                # If line has a closing brace, include it and stop
                elif '}' in next_line:
                    # Move the closing brace to the last echo line
                    if next_line.strip() == '}':
                        # Remove standalone closing brace line
                        command_lines[-1] = command_lines[-1].rstrip() + '}'
                    else:
                        command_lines.append(next_line)
                    break
                else:
                    # Not part of command, stop
                    break
            
            # Add the fixed command
            fixed_lines.extend(command_lines)
            i = j + 1
        else:
            fixed_lines.append(line)
            i += 1
    
    return '\n'.join(fixed_lines)

def fix_exec_get_active_users(content):
    """Fix the specific case of get_active_users missing @ prefix."""
    content = re.sub(
        r'/exec get_active_users',
        '/exec @get_active_users',
        content
    )
    return content

def main():
    """Fix multiline command issues in all files."""
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
                content = fix_multiline_exec_commands(content)
                content = fix_exec_get_active_users(content)
                
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