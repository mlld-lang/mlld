#!/usr/bin/env python3
import os
import glob
import re

# Find all markdown files
files = glob.glob('tests/cases/**/*.md', recursive=True)
files.extend(glob.glob('examples/**/*.mld', recursive=True))

# Patterns to fix command brackets
patterns = [
    (r'\[\((.*?)\)\]', r'{\1}'),  # General [(command)] -> {command}
    (r'\[(npm[^]]*)\](?!\s*#)', r'{\1}'),  # [npm ...] -> {npm ...} (not followed by #)
    (r'\[(find[^]]*)\]', r'{\1}'),  # [find ...] -> {find ...}
    (r'\[(grep[^]]*)\]', r'{\1}'),  # [grep ...] -> {grep ...}
    (r'\[(curl[^]]*)\]', r'{\1}'),  # [curl ...] -> {curl ...}
    (r'\[(sed[^]]*)\]', r'{\1}'),  # [sed ...] -> {sed ...}
    (r'\[(cat[^]]*)\]', r'{\1}'),  # [cat ...] -> {cat ...}
    (r'\[(test[^]]*)\]', r'{\1}'),  # [test ...] -> {test ...}
    (r'\[(ls[^]]*)\]', r'{\1}'),  # [ls ...] -> {ls ...}
]

total_updates = 0

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()
    
    original_content = content
    
    # Apply each pattern
    for pattern, replacement in patterns:
        # Skip patterns that would affect file/path references
        # Only apply if it's likely a command (starts with command name or contains pipe/redirect)
        content = re.sub(pattern, replacement, content)
    
    # Additional specific fixes
    content = content.replace('[(echo', '{echo')
    content = content.replace('[(npm', '{npm')
    content = content.replace('[(find', '{find')
    content = content.replace('[(grep', '{grep')
    content = content.replace('[(curl', '{curl')
    content = content.replace('[(sed', '{sed')
    content = content.replace('[(cat', '{cat')
    content = content.replace('[(test', '{test')
    content = content.replace('[(ls', '{ls')
    
    if content != original_content:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Updated: {file_path}")
        total_updates += 1

print(f"\nTotal files updated: {total_updates}")