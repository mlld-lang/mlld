Cannot define executables with /var

You attempted: ${ATTEMPTED_LINE}

The /var directive is for creating variables, not executables. To define a reusable command or function, use /exe instead:

  ${CORRECT_SYNTAX}

Common patterns:
  /exe @${FUNCTION_NAME}(params) = run {command}     # Shell command
  /exe @${FUNCTION_NAME}(params) = js {return ...}   # JavaScript function
  /exe @${FUNCTION_NAME}(params) = `template`        # Template function

See the documentation for more on defining executables with /exe.

