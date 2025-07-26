# LoadContentResult objects should auto-unwrap to .content when passed to JavaScript functions

## Issue Description

When alligator syntax (`<file>`) loads content in mlld, it returns a LoadContentResult object. In mlld contexts, this object automatically presents its `.content` property when used as a string (syntactic sugar). However, when passed to JavaScript functions via `/exe` or `/run js`, the full object is passed instead of just the content string.

## Current Behavior

```mlld
/var @moduleSource = <module.md>

# In mlld context - works as expected
/show @moduleSource              # Shows: "module content here..."
/var @msg = `Source: @moduleSource`  # @moduleSource interpolates as content

# When passed to JavaScript - unexpected
/exe @process(@moduleSource) = js {
  console.log(typeof moduleSource);     // "object"
  console.log(moduleSource);            // { content: "...", filename: "...", fm: {...}, ... }
  console.log(moduleSource.content);    // Need to manually access .content
}
```

## Expected Behavior

LoadContentResult objects should automatically unwrap to their `.content` property when passed as parameters to JavaScript functions, maintaining consistency with how they behave in mlld contexts.

```mlld
/exe @process(@moduleSource) = js {
  console.log(typeof moduleSource);     // "string"
  console.log(moduleSource);            // "module content here..."
}
```

## Rationale

1. **Consistency**: The syntactic sugar that makes `<file>` behave as content should work everywhere, including across the JS boundary

2. **Principle of least surprise**: If `@moduleSource` displays as content in mlld, it should be content in JS too

3. **Abstraction preservation**: Users shouldn't need to know about LoadContentResult internals - mlld is about orchestration, not object manipulation

4. **Common use case**: 99% of the time, users want the content when passing to JS, not the metadata

## Implementation Notes

- LoadContentResult objects should be detected and unwrapped to `.content` when preparing parameters for JS execution
- This should apply to both `/exe` functions and `/run js` commands
- If users need metadata, they can explicitly pass it: `/exe @fn(@file.content, @file.filename, @file.fm)`

## Test Case

```mlld
/var @file = <test.md>
/exe @checkType(@file) = js {
  return typeof file === 'string' ? 'PASS' : 'FAIL: got ' + typeof file;
}
/show @checkType  # Should output: "PASS"
```

## Impact

This change would fix issues like the one in the registry review workflow where `[object Object]` appears instead of actual content when LoadContentResult objects are passed through JavaScript functions.