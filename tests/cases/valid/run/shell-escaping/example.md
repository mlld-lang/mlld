# Test Shell Escaping in Commands

This tests that variables containing special shell characters are properly escaped.

/text @simple = "Hello World"
/text @with_quotes = "She said 'hello' and \"goodbye\""
/text @with_dollar = "Price is $100.00"
/text @with_backticks = "Use `npm install` to install"
/text @with_at = "@username mentioned @other"
/text @with_newlines = "Line 1
Line 2
Line 3"
/text @with_mixed = "Complex: $VAR, @user, `cmd`, 'single', \"double\""

// Test simple text
/run {echo "@simple"}

// Test quotes
/run {echo "@with_quotes"}

// Test dollar signs
/run {echo "@with_dollar"}

// Test backticks
/run {echo "@with_backticks"}

// Test @ symbols
/run {echo "@with_at"}

// Test newlines
/run {echo "@with_newlines"}

// Test mixed special characters
/run {echo "@with_mixed"}