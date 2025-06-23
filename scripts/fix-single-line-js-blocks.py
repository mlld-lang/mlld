#!/usr/bin/env python3
"""
Fix single-line JS/code blocks to have proper syntax.
"""

import os
import re
import glob

def fix_single_line_blocks(content):
    """Fix single-line code blocks that are missing 'return' or have improper syntax."""
    lines = content.split('\n')
    fixed_lines = []
    
    for line in lines:
        # Pattern: = js {expression} where expression doesn't have return
        match = re.match(r'^(/exec\s+@\w+.*?=\s*(?:js|javascript)\s*\{)\s*([^}]+)\}$', line)
        if match:
            prefix = match.group(1)
            code = match.group(2).strip()
            
            # If the code doesn't start with 'return' and looks like an expression
            if not code.startswith('return') and not code.startswith('const') and not code.startswith('let') and not code.startswith('//'):
                # Check if it's a simple expression (not a statement)
                if ';' not in code and '\n' not in code:
                    # Add 'return' for simple expressions
                    fixed_lines.append(f'{prefix}return {code}}}')
                else:
                    # Keep as is for statements
                    fixed_lines.append(line)
            else:
                fixed_lines.append(line)
        else:
            fixed_lines.append(line)
    
    return '\n'.join(fixed_lines)

def fix_dangling_code(content):
    """Fix code that appears outside of braces."""
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if this line has just a closing brace for a code expression
        if re.match(r'^\s*[^}]+\}$', line) and i > 0:
            prev_line = lines[i-1]
            # If previous line was an exec declaration with opening brace
            if re.match(r'^/exec\s+@\w+.*?=\s*(?:js|javascript|node|bash|sh)\s*\{$', prev_line):
                # Merge this line with previous
                fixed_lines[-1] = fixed_lines[-1] + line.strip()
                i += 1
                continue
        
        fixed_lines.append(line)
        i += 1
    
    return '\n'.join(fixed_lines)

def fix_indented_content(content):
    """Remove incorrect indentation from directives and markdown content."""
    lines = content.split('\n')
    fixed_lines = []
    in_code_block = False
    
    for line in lines:
        # Track if we're in a code block
        if line.strip().startswith('```'):
            in_code_block = not in_code_block
        
        # If not in a code block and line is indented
        if not in_code_block and line.startswith('  ') and not line.strip().startswith('//'):
            # Check if it's a directive or markdown content that shouldn't be indented
            if re.match(r'^\s+[#-]', line) or re.match(r'^\s+\w', line):
                # This looks like markdown content, unindent it
                fixed_lines.append(line.lstrip())
            else:
                fixed_lines.append(line)
        else:
            fixed_lines.append(line)
    
    return '\n'.join(fixed_lines)

def main():
    """Apply fixes to all files."""
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
                
                # Apply fixes
                content = fix_single_line_blocks(content)
                content = fix_dangling_code(content)
                content = fix_indented_content(content)
                
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