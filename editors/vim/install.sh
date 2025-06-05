#!/bin/bash

# mlld Vim Plugin Installation Script
# Installs mlld syntax highlighting for Vim and Neovim

echo "Installing mlld Vim/Neovim plugin..."

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Function to install files to a vim directory
install_to_vim_dir() {
    local vim_dir="$1"
    local vim_name="$2"
    
    if [ -d "$vim_dir" ]; then
        echo "Installing for $vim_name..."
        
        # Create directories if they don't exist
        mkdir -p "$vim_dir/syntax"
        mkdir -p "$vim_dir/ftdetect"
        mkdir -p "$vim_dir/ftplugin"
        mkdir -p "$vim_dir/indent"
        mkdir -p "$vim_dir/after/syntax"
        
        # Copy files
        cp -f "$SCRIPT_DIR/syntax/mlld.vim" "$vim_dir/syntax/"
        cp -f "$SCRIPT_DIR/ftdetect/mlld.vim" "$vim_dir/ftdetect/"
        cp -f "$SCRIPT_DIR/ftplugin/mlld.vim" "$vim_dir/ftplugin/"
        
        # Copy indent file if it exists
        if [ -f "$SCRIPT_DIR/indent/mlld.vim" ]; then
            cp -f "$SCRIPT_DIR/indent/mlld.vim" "$vim_dir/indent/"
        fi
        
        # Copy after/syntax for Markdown integration
        if [ -f "$SCRIPT_DIR/after/syntax/markdown.vim" ]; then
            cp -f "$SCRIPT_DIR/after/syntax/markdown.vim" "$vim_dir/after/syntax/"
        fi
        
        echo "✓ Installed mlld plugin for $vim_name"
        return 0
    else
        return 1
    fi
}

# Install for regular Vim
installed=false
if install_to_vim_dir "$HOME/.vim" "Vim"; then
    installed=true
fi

# Install for Neovim
if install_to_vim_dir "$HOME/.config/nvim" "Neovim"; then
    installed=true
fi

# Install for Neovim (alternative location)
if install_to_vim_dir "$HOME/.local/share/nvim/site" "Neovim (site)"; then
    installed=true
fi

if [ "$installed" = false ]; then
    echo "❌ No Vim or Neovim configuration directory found."
    echo "   Please ensure Vim or Neovim is installed and has been run at least once."
    exit 1
else
    echo ""
    echo "Installation complete! 🎉"
    echo ""
    echo "To use mlld syntax highlighting:"
    echo "  - Open any .mlld or .mld file in Vim/Neovim"
    echo "  - Syntax highlighting will be applied automatically"
    echo ""
    echo "For enhanced highlighting with custom colors, you may want to"
    echo "create an after/syntax/mlld.vim file with custom highlight groups."
fi