'template' keyword can only be used in exe definitions

The 'template' keyword creates a function from an external .att file.
It must be used with 'exe', not '${KEYWORD}':

  exe ${VARNAME}(args) = template "./file.att"    ✓ correct
  ${KEYWORD} ${VARNAME} = template "./file.att"   ✗ invalid

Found: ${LINE}

If you need to load file contents into a variable, use angle brackets:
  ${KEYWORD} ${VARNAME} = <./file.att>
