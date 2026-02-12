# Bracket Pattern Test Baseline

This document captures the current state of bracket syntax across all directives.
✅ = Currently works
❌ = Currently broken
🔍 = Needs testing

## 1. Basic Array Syntax

### Empty Arrays
```mlld
/var @empty1 = []        ✅ Works - creates empty array
/var @empty2 = [,]       ✅ Works - explicit empty array
/var @empty3 = [  ]      ✅ Works - empty with spaces
```

### Simple Arrays
```mlld
/var @numbers = [1, 2, 3]                    ✅ Works
/var @strings = ["a", "b", "c"]              ✅ Works
/var @mixed = [1, "two", true, null]         ✅ Works
/var @trailing = [1, 2, 3,]                  ✅ Works - trailing comma
```

### Nested Arrays
```mlld
/var @nested = [[1, 2], [3, 4]]              ✅ Works
/var @deep = [[[1]], [[2]]]                  ✅ Works
```

## 2. Path Dereferencing

### Basic Paths
```mlld
/var @content = [file.md]                    ✅ Works - loads file
/var @data = [data.json]                     ✅ Works - loads JSON
/show [README.md]                            ✅ Works - shows file
/import { config } from [config.mld]         ✅ Works - imports
```

### Paths with Variables
```mlld
/var @file = "data"
/var @ext = "json"
/var @content = [@file.@ext]                 🔍 Test needed
/var @nested = [path/@dir/file.md]           🔍 Test needed
```

## 3. Section Extraction

### In /show (Currently Working)
```mlld
/show [README.md # Installation]             ✅ Works
/show [docs/guide.md # Getting Started]      ✅ Works
/show [[path/file.md # Section]]             ✅ Works - double brackets
```

### In /var (Currently Broken)
```mlld
/var @section = [README.md # Installation]   ❌ "Unclosed array" error
/var @intro = [guide.md # Introduction]      ❌ "Unclosed array" error
```

### With Variable Section Names
```mlld
/var @sectionName = "Installation"
/show [README.md # @sectionName]             🔍 Test needed
/var @content = [file.md # @sectionName]     ❌ Would fail (var broken)
```

### In Arrays (Currently Broken)
```mlld
/var @sections = [
  [doc1.md # Intro],                         ❌ Would fail
  [doc2.md # Setup]                          ❌ Would fail
]
```

### In Object Values (Currently Broken)
```mlld
/var @docs = {
  intro: [guide.md # Introduction],          ❌ Would fail
  setup: [guide.md # Installation]           ❌ Would fail
}
```

## 4. Foreach Expressions

### Basic Foreach
```mlld
/var @files = ["a.md", "b.md", "c.md"]
/show foreach @process(@files)               ✅ Works
```

### Foreach with Sections (Not Implemented)
```mlld
/var @files = ["guide.md", "readme.md"]
/show foreach [@files # Introduction]        ❌ Not implemented
```

### Foreach Section Expression (Planned)
```mlld
/var @docs = [
  { path: "guide.md", title: "Guide" },
  { path: "readme.md", title: "Readme" }
]
/show foreach [@docs.path # Introduction] as `### @docs.title`  ❌ Not implemented
```

## 5. Import Specific Cases

### Import with Brackets
```mlld
/import [module.mld]                         ✅ Works - imports all
/import { a, b } from [module.mld]           ✅ Works - selective
/import { * } from [data.mld]                ✅ Works - explicit all
```

### Import Does Not Support Sections
```mlld
/import { config } from [settings.mld # Production]  ❌ Not supported
```

## 6. Complex Mixed Cases

### Arrays with Mixed Content
```mlld
/var @mixed = [
  [file1.md],                                ✅ Works - loads file
  "literal string",                          ✅ Works
  @variable,                                 ✅ Works
  { key: "value" }                           ✅ Works
]
```

### Attempting Section in Mixed Array
```mlld
/var @mixed = [
  [file1.md # Section],                      ❌ Would fail
  "other content"
]
```

## 7. Error Cases to Preserve

These should continue to produce errors:

```mlld
/var @bad1 = [                               ✅ Correctly errors - unclosed
/var @bad2 = [1, 2                           ✅ Correctly errors - unclosed
/var @bad3 = []]]                            ✅ Correctly errors - extra close
/path @p = [file.md]                         ✅ Correctly errors - /path is not a valid directive
```

## 8. With 'as' Modifier (Future)

Once unified pattern is implemented:

```mlld
/var @section = [guide.md # Setup] as "### Installation"    🎯 Goal
/show [README.md # Intro] as "# Introduction"               🎯 Goal
/var @sections = [
  [doc1.md # Overview] as "## Overview",                    🎯 Goal
  [doc2.md # Details] as "## Implementation"                 🎯 Goal
]
```

## Test Verification Commands

Run these to verify current state:

```bash
# Test working array
npm run ast -- '/var @arr = [1, 2, 3]'

# Test working section in show
npm run ast -- '/show [README.md # Installation]'

# Test broken section in var (will error)
npm run ast -- '/var @section = [README.md # Installation]'

# Test path loading
npm run ast -- '/var @content = [package.json]'
```

## Success Criteria

After implementing UnifiedBracketContent:
1. All ✅ items must continue working
2. All ❌ items should become ✅
3. All 🔍 items should be tested and documented
4. All 🎯 goal items should work with 'as' modifier
