# When Directive with Exec Invocation and Tail Modifiers

Test that @when actions support exec invocations with tail modifiers like trust.

/var @isTrue = "true"
/exe @transform(text) = {echo "@text" | tr '[:lower:]' '[:upper:]'}

/var @hasData = "true"

## Test basic exec invocation
/when @hasData => run @transform("hello world")

## Test trust modifier
/exe @sensitiveOp() = {echo "sensitive data"}
/when @isTrue => run @sensitiveOp() trust always