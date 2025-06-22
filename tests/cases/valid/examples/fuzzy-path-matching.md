# Fuzzy Path Matching Example

This example demonstrates mlld's smart path matching capabilities that make it easier to reference files without worrying about exact capitalization or spacing conventions.

## Setup

First, let's configure a custom resolver for our Desktop folder:

```bash
# Create an alias for your Desktop
mlld alias --name desktop --path ~/Desktop
```

This creates a resolver configuration in your `mlld.lock.json`:

```json
{
  "resolvers": {
    "@desktop": {
      "prefix": "@desktop/",
      "resolver": "LOCAL", 
      "type": "input",
      "config": {
        "basePath": "~/Desktop",
        "fuzzyMatch": {
          "enabled": true,
          "caseInsensitive": true,
          "normalizeWhitespace": true
        }
      }
    }
  }
}
```

## Case-Insensitive Matching

Now you can reference files without worrying about case:

/text @file1 = [@desktop/my-projects/readme.md]
/text @file2 = [@desktop/MY-PROJECTS/README.MD]
/text @file3 = [@desktop/My-Projects/Readme.md]

All three references point to the same file: `~/Desktop/My Projects/README.md`

## Whitespace Normalization

Spaces, dashes, and underscores are treated as interchangeable:

/text @notes = [@desktop/meeting-notes/2024-planning.md]
# Works even if the actual file is "Meeting Notes/2024 Planning.md"

/text @todo = [@desktop/my_important_tasks.md]
# Works even if the actual file is "My Important Tasks.md"

## Ambiguity Detection

If multiple files could match, mlld will tell you:

```
# If you have both "test-file.md" and "test_file.md":
/text @content = [@desktop/test-file.md]

# Error: Ambiguous path 'test-file' matches multiple files:
#   - test-file.md (exact match)
#   - test_file.md (whitespace match)
# 
# Please use a more specific path.
```

## Helpful Suggestions

When a file isn't found, mlld suggests similar files:

```
/text @doc = [@desktop/projekt/readme.md]

# Error: File not found: projekt/readme.md
#
# Did you mean:
#   - projects
#   - project1
#   - project2
```

## Disabling Fuzzy Matching

You can disable fuzzy matching for stricter path resolution:

```json
{
  "@desktop": {
    "config": {
      "fuzzyMatch": false  // Exact matches only
    }
  }
}
```

Or selectively disable features:

```json
{
  "@desktop": {
    "config": {
      "fuzzyMatch": {
        "enabled": true,
        "caseInsensitive": false,    // Case must match exactly
        "normalizeWhitespace": true   // But spaces/dashes still work
      }
    }
  }
}
```

## Performance Notes

- Directory listings are cached for 5 seconds to improve performance
- First access might be slightly slower as it builds the cache
- Large directories with many files work efficiently
- Security checks (path traversal, max depth) are always enforced