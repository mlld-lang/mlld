# Output with @run @command Syntax Test

This tests the @output directive with @run @command syntax.

@exec generateList() = @run [ls -la]
@exec showDate() = @run [date]

# Using @output @run @command syntax
@output @run @generateList() [generated-list.txt]
@output @run @showDate() [current-date.txt]