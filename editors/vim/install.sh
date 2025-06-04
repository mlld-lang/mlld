#!/bin/bash

# Installation script for mlld Vim/Neovim syntax highlighting

echo "Installing mlld syntax highlighting for Vim/Neovim..."

# Detect Vim and Neovim config directories
VIM_DIR="$HOME/.vim"
NVIM_DIR="$HOME/.config/nvim"

# Function to install files
install_files() {
    local target_dir="$1"
    
    if [ -d "$target_dir" ]; then
        echo "Installing to $target_dir..."
        
        # Create directories if they don't exist
        mkdir -p "$target_dir/syntax"
        mkdir -p "$target_dir/ftdetect"
        mkdir -p "$target_dir/ftplugin"
        mkdir -p "$target_dir/after/syntax"
        
        # Copy files
        cp syntax/mlld.vim "$target_dir/syntax/"
        cp ftdetect/mlld.vim "$target_dir/ftdetect/"
        cp ftplugin/mlld.vim "$target_dir/ftplugin/"
        cp after/syntax/markdown.vim "$target_dir/after/syntax/"
        
        echo "✓ Installed to $target_dir"
    fi
}

# Install for Vim
if command -v vim >/dev/null 2>&1; then
    install_files "$VIM_DIR"
fi

# Install for Neovim
if command -v nvim >/dev/null 2>&1; then
    install_files "$NVIM_DIR"
fi

echo ""
echo "Installation complete!"
echo ""
echo "To test the syntax highlighting:"
echo "1. Open a .mlld file in Vim/Neovim"
echo "2. Or open a .md file with mlld directives"
echo ""
echo "You can test with: vim ../../test-syntax-issues.mlld"