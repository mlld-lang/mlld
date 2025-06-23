#!/usr/bin/env python3
"""
Comprehensive fix for exec syntax issues.
"""

import os
import re
import glob

def fix_single_line_code_blocks(content):
    """Fix single-line code blocks that should be on next line."""
    # Pattern: = js {code} where code is not just {
    pattern = r'(=\s*(?:js|javascript|node|bash|sh|python)\s*\{)([^}]+\})'
    
    def replacer(match):
        prefix = match.group(1)
        code = match.group(2)
        # If it's a single line of code with closing brace, put on new line
        if '\n' not in code:
            return prefix + '\n  ' + code
        return match.group(0)
    
    content = re.sub(pattern, replacer, content)
    return content

def fix_indented_directives(content):
    """Fix directives that are incorrectly indented."""
    lines = content.split('\n')
    fixed_lines = []
    
    for line in lines:
        # If line starts with whitespace followed by a directive, remove the whitespace
        if re.match(r'^\s+/(text|data|exec|run|import|add|path|output|when)', line):
            fixed_lines.append(line.lstrip())
        else:
            fixed_lines.append(line)
    
    return '\n'.join(fixed_lines)

def fix_exec_environment_declarations(content):
    """Fix exec environment declarations like /exec @js = { ... }"""
    lines = content.split('\n')
    fixed_lines = []
    
    for line in lines:
        # Pattern: /exec @name = { list }
        if re.match(r'^/exec\s+@\w+\s*=\s*\{[^}]+\}', line):
            # This is correct single-line syntax, keep as is
            fixed_lines.append(line)
        else:
            fixed_lines.append(line)
    
    return '\n'.join(fixed_lines)

def fix_multiline_exec_blocks(content):
    """Fix multiline exec blocks with proper formatting."""
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if this is the start of an exec block with code
        if re.match(r'^/exec\s+@\w+.*?=\s*(?:js|javascript|node|bash|sh|python)\s*\{$', line):
            # This is correctly formatted - opening brace at end of line
            fixed_lines.append(line)
            i += 1
            
            # Process the code block
            brace_count = 1
            while i < len(lines) and brace_count > 0:
                code_line = lines[i]
                
                # Count braces
                brace_count += code_line.count('{') - code_line.count('}')
                
                # If this is code inside the block, ensure it's indented
                if brace_count > 0 and code_line.strip() and not code_line.startswith('  '):
                    fixed_lines.append('  ' + code_line.lstrip())
                elif brace_count == 0 and code_line.strip() == '}':
                    # Closing brace should be at column 0
                    fixed_lines.append('}')
                else:
                    fixed_lines.append(code_line)
                
                i += 1
        else:
            fixed_lines.append(line)
            i += 1
    
    return '\n'.join(fixed_lines)

def main():
    """Apply all fixes to files."""
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
                
                # Apply fixes in order
                content = fix_single_line_code_blocks(content)
                content = fix_indented_directives(content)
                content = fix_exec_environment_declarations(content)
                content = fix_multiline_exec_blocks(content)
                
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