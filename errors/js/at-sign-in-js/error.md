Cannot use @${VARNAME} syntax inside JavaScript code blocks

JavaScript blocks use regular variable names, not @ syntax:
  ✗ js { const x = @${VARNAME}; }
  ✅ js { const x = ${VARNAME}; }

To use mlld variables in JavaScript:
1. Pass them as parameters to the function
2. Reference them by name (without @) inside the JS block

Found: ${USAGE}