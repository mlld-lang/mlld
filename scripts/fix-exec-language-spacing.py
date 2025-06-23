#!/usr/bin/env python3
"""
Fix spacing between language specifier and code blocks in exec declarations.
"""

import os
import re
import glob

def fix_language_spacing(content):
    """Fix missing space between language and { in exec declarations."""
    # Pattern to match: = language{ (missing space before {)
    # Languages: js, node, bash, sh, python
    pattern = r'=\s*(js|node|bash|sh|python)\s*\{'
    
    def replacer(match):
        lang = match.group(1)
        return f'= {lang} {{'
    
    content = re.sub(pattern, replacer, content)
    return content

def fix_run_language_spacing(content):
    """Fix missing space between language and { in run directives."""
    # Pattern to match: /run language{ (missing space before {)
    pattern = r'/run\s+(js|node|bash|sh|python)\s*\{'
    
    def replacer(match):
        lang = match.group(1)
        return f'/run {lang} {{'
    
    content = re.sub(pattern, replacer, content)
    return content

def main():
    """Fix language spacing in all files."""
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
                content = fix_language_spacing(content)
                content = fix_run_language_spacing(content)
                
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