No slash needed after => in when directives

Found: when ${CONDITION} => ${ACTION}

In when actions (after =>), directives don't need the slash prefix. The slash is only for starting new mlld lines.

✗ Wrong: when ${CONDITION} => ${ACTION}
✓ Right: when ${CONDITION} => ${FIXED_ACTION}

Common examples:
✗ Wrong: when @isValid => show "Valid!" (with slash)
✓ Right: when @isValid => show "Valid!"

✗ Wrong: when @error => output @message to stderr (with slash)
✓ Right: when @error => output @message to stderr

✗ Wrong: when @needsProcessing => var @result = @process(@data) (with slash)
✓ Right: when @needsProcessing => @result = @process(@data)

Note: Variable assignments in when don't even need 'var':
✓ Right: when @condition => @myVar = "value"