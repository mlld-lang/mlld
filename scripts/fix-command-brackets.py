#!/usr/bin/env python3
import os
import glob
import re

# Find all markdown files
files = glob.glob('tests/cases/**/*.md', recursive=True)
files.extend(glob.glob('examples/**/*.mld', recursive=True))

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Replace [(echo patterns with {echo
    updated = content.replace('[(echo', '{echo')
    
    if updated != content:
        with open(file_path, 'w') as f:
            f.write(updated)
        print(f"Updated: {file_path}")

print("Command bracket update complete!")