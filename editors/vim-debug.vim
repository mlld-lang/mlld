" Debug script for mlld syntax
echo "=== Vim Syntax Debug ==="
echo "Filetype: " . &filetype
echo "Syntax: " . &syntax
echo "Current syntax: " . (exists("b:current_syntax") ? b:current_syntax : "none")
echo ""
echo "Syntax files found:"
echo globpath(&rtp, "syntax/mlld.vim")
echo ""
echo "Highlighting test:"
echo "  Statement group: " . synIDattr(hlID("Statement"), "name")
echo "  Keyword group: " . synIDattr(hlID("Keyword"), "name")
echo "  Comment group: " . synIDattr(hlID("Comment"), "name")
echo ""
echo "Loaded syntax items:"
syntax list mlldDirective
syntax list mlldComment
syntax list mlldVariable