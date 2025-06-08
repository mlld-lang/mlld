---
name: run-quoted-special-chars
description: Shell special characters inside quoted strings should be treated as literal text
---

# Test quoted special characters in shell commands

These characters have special meaning in shell but should be allowed inside quoted strings:

@run [(echo '<div>Hello</div>')]
@run [(echo "Price: $5 > $3")]
@run [(echo 'A && B || C')]
@run [(echo "Redirect to file: > output.txt")]
@run [(echo 'Background job: command &')]
@run [(echo "Append >> to file")]
@run [(echo 'Chain commands: cmd1 ; cmd2')]

# Mixed quotes
@run [(sh -c 'echo "<tag>" && echo "done"')]

# Inside command substitution
@run [(echo "$(echo '<nested>')" )]

# File paths with special chars
@run [(ls -la './path>with>arrows/')]

# Using grep with regex patterns  
@run [(grep '<.*>' test.txt | head -1)]

# sed with angle brackets
@run [(echo "test" | sed 's/test/<replaced>/')]