# Extra Closing Parenthesis in Code Block

This example shows an invalid syntax where there's an extra closing parenthesis before the closing bracket in a code block.

@run javascript [(async () => "Async IIFE")()]

This should fail because the code block syntax is `[(code)]`, not `[(code)()]`.