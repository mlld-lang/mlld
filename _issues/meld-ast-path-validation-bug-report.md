# Bug Report: Inconsistent Path Validation in meld-ast Parser

## Bug Summary
The meld-ast parser has inconsistent handling of path variables and special path prefixes (`$.` and `$~`) between different directive types. Specifically, while these special path formats work correctly in `@path` directives, they fail validation when used in `@embed` and `@import` directives, leading to test failures and a confusing developer experience.

## Reproduction Steps
1. Create a file structure with a template to embed:
```
templates/
  header.md  (contains "This is embedded content")
```

2. Create a test file that uses a path variable in an `@embed` directive:
```
@path templates = "$PROJECTPATH/templates"
@embed [$templates/header.md]
```

3. When parsing this content, the `@path` directive correctly validates, but the `@embed` directive fails with the error:
```
MeldInterpreterError: Interpreter error (Directive): Directive error (path): Failed to resolve path: Paths with segments must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths
```

## Diagnostic Findings
After extensive debugging, we've determined that:

1. Path validation works correctly for `@path` directives with special syntax:
   - `@path data = "$~/data"` - Works correctly
   - `@path templates = "$PROJECTPATH/templates"` - Works correctly
   - `@path templates = "$./templates"` - Validation fails (not supported by current parser)

2. Path validation fails for special paths in `@embed` directives:
   - `@embed [$templates/header.md]` - Fails validation even when `templates` is defined correctly

3. The issue appears to be that the parser correctly parses paths in `@path` directives, but in `@embed` and `@import` directives, it:
   - Correctly parses the variable reference (`$templates`)
   - Incorrectly includes the quotes when validating the path value
   - Doesn't correctly pass structured path information between handler layers

4. The root cause seems to be related to how the parser treats quoted vs. unquoted paths differently across different directive types.

## Impact
- Integration tests fail when testing path variable usage in directives
- Developers cannot use path variables in `@embed` and `@import` directives reliably
- The inconsistency between what works in `@path` directives vs. other directives is confusing

## Proposed Solution
1. Update the meld-ast parser to ensure consistent path validation by:
   - Trimming quotes from path strings before validation
   - Ensuring that path prefixes like `$.` and `$~` are correctly recognized regardless of directive type
   - Making the path validation logic consistent across all directive types

2. Check for correct parsing and validation of path variables:
   - When a path variable is used (e.g., `$templates/header.md`), ensure the variable is correctly recognized
   - Properly validate paths that combine path variables with additional path segments

## Additional Context
- The issue appears to be within the meld-ast parser, as evidenced by the parser failing to correctly handle path variables and special path prefixes in certain contexts but not others
- The validation failure originates in the PathService when paths are parsed by the parser service
- The problem is reproducible in the latest version of the codebase

## Workaround
Until this issue is fixed, we've had to modify our tests to use only `$PROJECTPATH` and `$HOMEPATH` instead of the more convenient `$.` and `$~` aliases, and we need to ensure all path variables are properly quoted.

## Tags
#path-validation #parser #bug #directives 