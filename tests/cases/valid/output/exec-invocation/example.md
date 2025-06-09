# Output with Command Invocation Test

This tests the @output directive with command invocation syntax.

@exec listFiles() = @run [ls -la]
@exec countWords(file) = @run [wc -w @file]

# Direct command invocation output
@output @listFiles() [file-list.txt]
@output @countWords("README.md") [word-count.txt]

# The @output @run @command syntax would be for inline commands:
@text inlineExample = "Example showing inline command"
@output @run @listFiles [inline-list.txt]