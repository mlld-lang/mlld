# content loading

## tldr

The alligator syntax (`<file>`) loads file contents and provides access to metadata like token counts, frontmatter, and file paths. Works with single files, glob patterns, URLs, and section extraction.

```mlld
/var @readme = <README.md>              >> Load file content
/show @readme                           >> Shows the content
/show @readme.tokest                    >> Shows estimated token count
/show @readme.fm.title                  >> Shows frontmatter title

/var @docs = <*.md>                     >> Load multiple files
/var @section = <guide.md # setup>      >> Extract specific section
```

## file loading basics

The angle bracket syntax `<...>` loads file contents into variables. Think of it as "give me what's inside this file."

```mlld
>> Basic file loading
/var @content = <config.json>           >> Loads file contents
/var @name = "config.json"              >> Stores literal string

>> The difference is important:
/show @content                          >> Shows file contents
/show @name                             >> Shows "config.json"
```

## metadata access

Every loaded file provides metadata through properties:

```mlld
/var @file = <package.json>

>> Basic metadata
/show @file.filename                    >> "package.json"
/show @file.relative                    >> "./package.json"
/show @file.absolute                    >> "/Users/you/project/package.json"

>> Token counting
/show @file.tokest                      >> Estimated tokens (fast)
/show @file.tokens                      >> Exact tokens (same as estimate currently)

>> Content parsing
/show @file.json.name                   >> Access parsed JSON
/show @file.json.dependencies.mlld     >> Nested JSON access
```

## token counting

Token counts help manage context windows when working with LLMs:

```mlld
>> Single file token info
/var @doc = <README.md>
/show `Document has ~@doc.tokest tokens`

>> Filter files by size
/var @docs = <docs/**/*.md>
/var @large = foreach @doc(@docs) {
  /when @doc.tokest > 2000 => @doc
}
/show `Found @large.length large documents`
```

Token estimation uses character-based heuristics:
- Code files: ~4 characters per token
- Data files (JSON/XML): ~5 characters per token
- Exact counting matches estimation currently

## glob patterns

Load multiple files using standard glob patterns:

```mlld
>> Common patterns
/var @markdown = <*.md>                 >> All .md in current directory
/var @tests = <**/*.test.ts>            >> All test files recursively
/var @docs = <docs/**/*.md>             >> All markdown in docs tree
/var @source = <{src,lib}/**/*.js>      >> Multiple directories

>> Access individual files
/show @docs.0.content                   >> First file's content
/show @docs.0.filename                  >> First file's name

>> Process all files
/show @docs                             >> Shows all contents concatenated
```

## section extraction

Extract specific sections from markdown files using `#`:

```mlld
>> Extract single section
/var @install = <README.md # Installation>

>> Extract from multiple files
/var @apis = <docs/*.md # API Reference>

>> Files without the section are skipped
/show `Found @apis.length files with API sections`
```

## frontmatter access

Access YAML frontmatter from markdown files:

```mlld
/var @post = <blog/post.md>

>> Access frontmatter fields
/show @post.fm.title                    >> Post title
/show @post.fm.author                   >> Author name
/show @post.fm.tags                     >> Array of tags

>> Conditional processing
/when @post.fm.published => show @post.content
```

## json file handling

JSON files are automatically parsed:

```mlld
/var @config = <settings.json>

>> Direct field access
/show @config.json.apiUrl
/show @config.json.features.auth
/show @config.json.users[0].email       >> Array access

>> The content is still available as string
/show @config.content                   >> Raw JSON string
```

## url loading

Load content directly from URLs:

```mlld
/var @page = <https://example.com/data.json>

>> URL-specific metadata
/show @page.url                         >> Full URL
/show @page.domain                      >> "example.com"
/show @page.status                      >> HTTP status code
/show @page.title                       >> Page title (if HTML)

>> Content is converted to markdown for HTML pages
/show @page.content                     >> Markdown version
/show @page.rawContent                  >> Original HTML
```

## section renaming with 'as'

The `as` syntax renames section titles when extracting content:

```mlld
>> Rename a single section
/var @intro = <README.md # introduction> as "# Getting Started"

>> Rename sections from multiple files
/var @modules = <*.mld.md # tldr> as "### [<>.fm.name](<>.relative)"

>> The <> placeholder represents each file's metadata
>> The content remains unchanged - only the title is replaced

>> Example output for modules:
>> ### [array](./array.mld.md)
>> Array utilities and operations.
```

## auto-unwrapping behavior

Content is automatically extracted in most contexts:

```mlld
/var @doc = <README.md>

>> These are equivalent:
/show @doc                              >> Shows content
/show @doc.content                      >> Explicit content access

>> In templates
/var @msg = `File says: @doc`          >> Uses content automatically

>> In JavaScript functions
/exe @process(@input) = js {
  // input is the string content, not the object
  return input.toUpperCase();
}
/var @result = @process(@doc)           >> Passes content string
```

## practical examples

### documentation builder

```mlld
>> Collect all module documentation
/var @modules = <modules/**/*.md>

>> Build README with metadata
/var @readme = `# Project Modules

Total modules: @modules.length

@modules

Generated on @now
`

/output @readme to "README.md"
```

### token-aware processing

```mlld
>> Load files and check context limits
/var @files = <src/**/*.ts>
/var @totalTokens = 0

>> Calculate total tokens
/var @results = foreach @file(@files) {
  /var @totalTokens = @totalTokens + @file.tokest
  /show `@file.filename: @file.tokest tokens`
}

/show `Total: @totalTokens tokens`
```

### conditional loading

```mlld
>> Load config based on frontmatter
/var @posts = <blog/*.md>

>> Published posts only
/var @published = foreach @post(@posts) {
  /when @post.fm.status == "published" => @post
}

>> Format for display
/var @listing = foreach @post(@published) {
  /show `- [@post.fm.title](@post.relative) (@post.tokest tokens)`
}
```

## common patterns

### check file existence

```mlld
>> Pattern returns empty array if no matches
/var @config = <config.json>
/when @config => show "Config loaded"

/var @optional = <optional-file.txt>
/when !@optional => show "Optional file not found"
```

### combine multiple sources

```mlld
>> Load from different locations
/var @localDocs = <docs/*.md>
/var @externalDocs = <https://example.com/api-docs.md>
/var @allDocs = [@localDocs, @externalDocs]
```

### extract and rename sections

```mlld
>> Extract sections and give them new titles
/var @examples = <tutorials/*.md # Example> as "### Example from <>.fm.title"

>> Build a table of contents from sections
/var @toc = <docs/*.md # overview> as "- [<>.fm.title Overview](<>.relative)"

/show @toc
```

## absolute paths

By default, mlld restricts file access to the project root:

```mlld
/var @system = </etc/hosts>         >> Error: outside project root
/path @abs = "/usr/local/config"
/var @config = <@abs>                >> Error: outside project root
```

Enable absolute paths with `--allow-absolute` flag:

```bash
mlld script.mld --allow-absolute
```

Now absolute paths work:

```mlld
/var @hosts = </etc/hosts>          >> Loads system file
/path @tmp = "/tmp/data.txt"
/var @data = <@tmp>                  >> Loads from /tmp
```

## limitations

- Token counting uses estimation (4-5 chars/token depending on file type)
- Exact token counting currently returns the same as estimation
- Glob patterns follow standard rules (see glob documentation)
- Section extraction works only with markdown heading syntax
- URL loading requires valid URLs with proper protocols
- Absolute paths require `--allow-absolute` flag for security