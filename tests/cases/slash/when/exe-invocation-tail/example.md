# When Directive with Exec Invocation and Tail Modifiers

Test that @when actions support exec invocations with optional tail modifiers.

/var @isTrue = "true"
/exe @transform(text) = cmd {echo "@text" | tr '[:lower:]' '[:upper:]'}

/var @hasData = "true"

## Test basic exec invocation
/when @hasData => run @transform("hello world")

## Test exec invocation without extra modifiers
/exe @sensitiveOp() = cmd {echo "sensitive data"}
/when @isTrue => run @sensitiveOp()
