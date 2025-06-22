#!/usr/bin/env python3
"""
Comprehensive script to update mlld test files to new syntax.
Updates all syntax elements in one pass to avoid partial states.
"""

import os
import re
import glob
import sys
from typing import List, Tuple

class SyntaxUpdater:
    def __init__(self, dry_run=False):
        self.dry_run = dry_run
        self.changes = []
        self.errors = []
        self.interpolation_warnings = []
        
    def update_all(self, pattern="tests/cases/**/*.md"):
        """Update all files matching the pattern."""
        files = glob.glob(pattern, recursive=True)
        # Add example files
        files.extend(glob.glob("examples/**/*.mld", recursive=True))
        
        print(f"Found {len(files)} files to process")
        
        for filepath in files:
            try:
                self.update_file(filepath)
            except Exception as e:
                self.errors.append((filepath, str(e)))
                
        self.print_summary()
        
    def update_file(self, filepath):
        """Update a single file with all syntax transformations."""
        with open(filepath, 'r') as f:
            content = f.read()
            
        original = content
        
        # Apply all transformations in order
        content = self.update_directives(content)
        content = self.update_comments(content)
        content = self.update_variable_declarations(content)
        content = self.update_exec_declarations(content)
        content = self.update_command_brackets(content)
        content = self.check_string_interpolation(content, filepath)
        
        if content != original:
            if not self.dry_run:
                with open(filepath, 'w') as f:
                    f.write(content)
            self.changes.append(filepath)
            
    def update_directives(self, content):
        """Update @ to / for directives at start of lines."""
        directives = ['text', 'run', 'add', 'import', 'data', 'exec', 'path', 'output', 'when']
        for d in directives:
            content = re.sub(f'^@{d}\\b', f'/{d}', content, flags=re.MULTILINE)
        return content
        
    def update_comments(self, content):
        """Update >> to // for comments."""
        # Handle both >> and << style comments
        content = re.sub(r'^>>', '//', content, flags=re.MULTILINE)
        content = re.sub(r'\s+>>\s+', ' // ', content)
        content = re.sub(r'\s+<<\s+', ' // ', content)
        return content
        
    def update_variable_declarations(self, content):
        """Add @ prefix to variable names in declarations."""
        # Match: /directive name = 
        # Replace with: /directive @name =
        pattern = r'^(/(?:text|data|path))\s+([a-zA-Z_]\w*)\s*='
        content = re.sub(pattern, r'\1 @\2 =', content, flags=re.MULTILINE)
        return content
        
    def update_exec_declarations(self, content):
        """Update exec declarations to use @ prefix."""
        # Match: /exec funcname(...) =
        # Replace with: /exec @funcname(...) =
        pattern = r'^(/exec)\s+([a-zA-Z_]\w*)\s*\('
        content = re.sub(pattern, r'\1 @\2(', content, flags=re.MULTILINE)
        return content
        
    def update_command_brackets(self, content):
        """Update [(command)] to {command} while preserving [file] patterns."""
        # This is the trickiest part - we need to be careful
        
        # First, update [(command)] patterns
        content = re.sub(r'\[\((.*?)\)\]', r'{\1}', content, flags=re.DOTALL)
        
        # Also update common command patterns that might not have full [()]
        # But be careful not to change array literals or file references
        
        # Update [echo ...] but not array literals
        content = re.sub(r'\[(echo\s[^]]+)\]', r'{\1}', content)
        content = re.sub(r'\[(npm\s[^]]+)\]', r'{\1}', content)
        content = re.sub(r'\[(find\s[^]]+)\]', r'{\1}', content)
        content = re.sub(r'\[(grep\s[^]]+)\]', r'{\1}', content)
        content = re.sub(r'\[(curl\s[^]]+)\]', r'{\1}', content)
        content = re.sub(r'\[(sed\s[^]]+)\]', r'{\1}', content)
        content = re.sub(r'\[(cat\s[^]]+)\]', r'{\1}', content)
        content = re.sub(r'\[(test\s[^]]+)\]', r'{\1}', content)
        content = re.sub(r'\[(ls\s[^]]+)\]', r'{\1}', content)
        
        return content
        
    def check_string_interpolation(self, content, filepath):
        """Check for potential string interpolation issues."""
        # Find double-quoted strings containing @variables
        pattern = r'"[^"]*@[a-zA-Z_]\w*[^"]*"'
        matches = re.findall(pattern, content)
        
        if matches:
            self.interpolation_warnings.append((filepath, matches))
            
        # For now, we don't auto-convert to single quotes
        # This needs manual review
        return content
        
    def print_summary(self):
        """Print summary of changes."""
        print(f"\n{'DRY RUN' if self.dry_run else 'UPDATE'} SUMMARY:")
        print(f"Files {'would be' if self.dry_run else ''} modified: {len(self.changes)}")
        
        if self.errors:
            print(f"\nErrors: {len(self.errors)}")
            for filepath, error in self.errors[:5]:
                print(f"  {filepath}: {error}")
                
        if self.interpolation_warnings:
            print(f"\nString interpolation warnings: {len(self.interpolation_warnings)}")
            print("These files have double-quoted strings with @ that will now interpolate:")
            for filepath, matches in self.interpolation_warnings[:10]:
                print(f"  {filepath}")
                for match in matches[:3]:
                    print(f"    {match}")
                    
        if self.dry_run:
            print("\nRun without --dry-run to apply changes")

def main():
    dry_run = '--dry-run' in sys.argv
    updater = SyntaxUpdater(dry_run=dry_run)
    updater.update_all()

if __name__ == '__main__':
    main()