# When Directive with Exec Invocation and Tail Modifiers

Test that @when actions support exec invocations with tail modifiers like trust.

@exec transform(text) = @run [(echo "@text" | tr '[:lower:]' '[:upper:]')]

@text hasData = "true"

## Test basic exec invocation
@when @hasData => @run @transform("hello world")

## Test trust modifier
@exec sensitiveOp() = @run [(echo "sensitive data")]
@when true => @run @sensitiveOp() trust always