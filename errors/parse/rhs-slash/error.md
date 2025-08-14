Unexpected '/' in ${CONTEXT} context. The slash prefix is only for starting directive lines.

Found: ${LINE}

The '/' character signals "interpret this line as an mlld directive" and should only appear at the beginning of lines. In action contexts (after '=>' or '='), use the directive name without the slash:

✗ Wrong: /when @x => /show "text"
✓ Right: /when @x => show "text"

✗ Wrong: /for @item in @list => /output @item to "file.txt"
✓ Right: /for @item in @list => output @item to "file.txt"

✗ Wrong: /var @result = /run {echo "hello"}
✓ Right: /var @result = run {echo "hello"}

The slash is the "mlld mode" indicator, not part of the command name. Once you're in an mlld directive, you don't need to re-enter mlld mode.