#!/bin/bash
# Install script for TextMate/Sublime Text syntax highlighting

echo "mlld Syntax Highlighting Installer"
echo "=================================="

# TextMate installation
if [ -d "$HOME/Library/Application Support/TextMate" ]; then
    echo "Installing for TextMate..."
    mkdir -p "$HOME/Library/Application Support/TextMate/Bundles/mlld.tmbundle/Syntaxes"
    cp editors/textmate/*.json "$HOME/Library/Application Support/TextMate/Bundles/mlld.tmbundle/Syntaxes/"
    echo "✓ TextMate installation complete"
    echo "  Please reload bundles in TextMate: Bundles → Bundle Editor → Reload Bundles"
else
    echo "⚠ TextMate not found"
fi

# Sublime Text 3 installation
if [ -d "$HOME/Library/Application Support/Sublime Text 3" ]; then
    echo "Installing for Sublime Text 3..."
    mkdir -p "$HOME/Library/Application Support/Sublime Text 3/Packages/mlld"
    cp editors/textmate/*.json "$HOME/Library/Application Support/Sublime Text 3/Packages/mlld/"
    echo "✓ Sublime Text 3 installation complete"
elif [ -d "$HOME/Library/Application Support/Sublime Text" ]; then
    echo "Installing for Sublime Text..."
    mkdir -p "$HOME/Library/Application Support/Sublime Text/Packages/mlld"
    cp editors/textmate/*.json "$HOME/Library/Application Support/Sublime Text/Packages/mlld/"
    echo "✓ Sublime Text installation complete"
else
    echo "⚠ Sublime Text not found"
fi

# Nova installation (if you use Panic's Nova editor)
if [ -d "$HOME/Library/Application Support/Nova" ]; then
    echo "For Nova, you'll need to create an extension. The TextMate grammar files can be adapted."
fi

echo ""
echo "Installation complete!"
echo "Test with: editors/test-syntax.mlld"