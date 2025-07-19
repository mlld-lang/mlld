# Alligator Glob with Section Rename

This test demonstrates the alligator glob pattern with section extraction and rename using the `as` syntax.

## Setup Test Files

/var @modules = [
  {"name": "ai", "desc": "AI integration for mlld scripts"},
  {"name": "array", "desc": "Array utilities and operations"},
  {"name": "time", "desc": "Time and date utilities"}
]

## Single File Section Rename

First, let's test renaming a section from a single file:

/var @single = <single-module.mld.md # tldr> as "### Module: <>.fm.name"
/show @single

## Glob Pattern with Section Rename

Now let's use a glob pattern to extract and rename sections from multiple files:

/var @allModules = <*.mld.md # tldr> as "### [<>.fm.name](<>.relative)"
/show @allModules

## With Backtick Templates

The rename syntax also supports backtick templates:

/var @backtickRename = <single-module.mld.md # tldr> as `## <>.fm.name v<>.fm.version`
/show @backtickRename

## Complex Field Access

You can access nested fields in frontmatter:

/var @withAuthor = <with-author.mld.md # summary> as "## <>.fm.name by <>.fm.author"
/show @withAuthor