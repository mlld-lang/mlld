# Test Shell Escaping in Commands

This tests that variables containing special shell characters are properly escaped.

>> Test simple text
Hello World

>> Test quotes
She said 'hello' and "goodbye"

>> Test dollar signs
Price is $100.00

>> Test backticks
Use `npm install` to install

>> Test @ symbols
@username mentioned @other

>> Test newlines
Line 1
Line 2
Line 3

>> Test mixed special characters
Complex: $VAR, @user, `cmd`, 'single', "double"