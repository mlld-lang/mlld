# When Directive with Exec Invocation and Tail Modifiers

Test that @when actions support exec invocations with tail modifiers like trust.

@data isTrue = true
@exec transform(text) = [(echo "@text" | tr '[:lower:]' '[:upper:]')]

@text hasData = "true"

## Test basic exec invocation
@when @hasData => @run @transform("hello world")

## Test trust modifier
@exec sensitiveOp() = [(echo "sensitive data")]
@when @isTrue => @run @sensitiveOp() trust always