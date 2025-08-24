# When Comma-Separated Error

This error occurs when trying to use comma-separated conditions in a when block, which is not valid mlld syntax.

## Example of the error:

```mlld
/exe @test() = when [
  @x => retry "hint", * => @y
]
```

## Correct syntax:

```mlld
/exe @test() = when [
  @x => retry "hint"
  * => @y
]
```

## Why this happens:

When blocks in mlld evaluate conditions line by line, similar to switch statements. Each condition-action pair must be on its own line. The comma syntax is not supported because it would be ambiguous with other mlld constructs like array literals and function arguments.