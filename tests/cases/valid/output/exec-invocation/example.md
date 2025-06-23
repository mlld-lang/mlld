# Output with Command Invocation Test

This tests the @output directive with command invocation syntax.

/exe @listFiles() = {ls -la}
/exe @countWords(file) = {wc -w @file}

# Direct command invocation output
/output @listFiles() to "file-list.txt"
/output @countWords("README.md") to "word-count.txt"

# The @output @run @command syntax would be for inline commands:
/var @inlineExample = "Example showing inline command"
/output @inlineExample to "inline-example.txt"