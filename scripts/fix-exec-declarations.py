#!/usr/bin/env python3
"""
Fix exec declarations that are missing @ prefix.
"""

import os
import re
import glob

def fix_exec_declarations(content):
    """Fix exec declarations missing @ prefix."""
    # Pattern to match exec declarations without @ prefix
    # /exec funcname = or /exec funcname() = 
    pattern = r'^(/exec)\s+([a-zA-Z_]\w*)(\s*(?:\([^)]*\))?\s*=)'
    
    def replacer(match):
        prefix = match.group(1)
        name = match.group(2)
        rest = match.group(3)
        # Check if name already has @ prefix
        if not name.startswith('@'):
            return f'{prefix} @{name}{rest}'
        return match.group(0)
    
    content = re.sub(pattern, replacer, content, flags=re.MULTILINE)
    return content

def fix_data_field_assignments(content):
    """Fix data field assignments like /data name.field = value"""
    # This should be /data @name = { "field": value }
    # But for now, let's just add the @ prefix
    pattern = r'^(/data)\s+([a-zA-Z_]\w*)(\.[a-zA-Z_]\w*\s*=)'
    
    def replacer(match):
        prefix = match.group(1)
        name = match.group(2)
        rest = match.group(3)
        return f'{prefix} @{name}{rest}'
    
    content = re.sub(pattern, replacer, content, flags=re.MULTILINE)
    return content

def fix_exec_js_node_syntax(content):
    """Fix exec js/node declarations with incorrect syntax."""
    # Pattern to match: /exec @name() = js {} or = node {}
    # This is incorrect - should be = js { code } or = node { code }
    lines = content.split('\n')
    fixed_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if this is an exec with js/node and empty braces
        if re.match(r'^/exec\s+@\w+.*=\s*(js|node|bash|sh)\s*\{\s*\}', line):
            # Collect the following lines until we find the closing brace
            code_lines = [line.rstrip()]
            j = i + 1
            brace_count = 1
            
            while j < len(lines) and brace_count > 0:
                next_line = lines[j]
                code_lines.append(next_line)
                brace_count += next_line.count('{') - next_line.count('}')
                j += 1
            
            # Reconstruct the exec command with proper syntax
            # Remove the empty {} and collect all code
            first_line = re.sub(r'\{\s*\}', '{', code_lines[0])
            if len(code_lines) > 1:
                # Add closing brace to the last code line if not present
                if '}' not in code_lines[-1]:
                    code_lines[-1] += '}'
            else:
                first_line += '}'
            
            fixed_lines.append(first_line)
            if len(code_lines) > 1:
                fixed_lines.extend(code_lines[1:])
            i = j
        else:
            fixed_lines.append(line)
            i += 1
    
    return '\n'.join(fixed_lines)

def main():
    """Fix exec declarations in all files."""
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
                content = fix_exec_declarations(content)
                content = fix_data_field_assignments(content)
                content = fix_exec_js_node_syntax(content)
                
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