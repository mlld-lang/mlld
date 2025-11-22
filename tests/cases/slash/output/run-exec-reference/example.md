# Output with run @command Syntax Test

This tests the @output directive with run @command syntax.

/exe @generateList() = cmd {ls -la}
/exe @showDate() = cmd {date}

# Using @output with exec references
/output @generateList() to "generated-list.txt"
/output @showDate() to "current-date.txt"