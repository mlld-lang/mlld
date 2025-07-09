Running llm/run/build.mld...

# mlld Standard Library Modules

Standard library modules for the mlld prompt scripting language.

## Available Modules

### mlld-dev/ai

See full docs: [ai](./llm/modules/ai.mld.md#docs)

Easy AI integration for your mlld scripts:

```mlld
/import { claude, llm, codex, gemini } from @mlld/ai

/var @response = @claude.ask("What's the capital of France?")
/show `Claude says: @response`

/var @answer = @llm.ask("You are a helpful assistant", "Explain quantum computing in one sentence")
/show `LLM says: @answer`
```

### mlld/array

See full docs: [array](./llm/modules/array.mld.md#docs)

Process data arrays with powerful operations:

```mlld
/import { filter, sortBy, pluck, sum, groupBy } from @mlld/array

/var @users = [
  {"name": "alice", "age": 30, "dept": "engineering"},
  {"name": "bob", "age": 25, "dept": "design"},
  {"name": "charlie", "age": 35, "dept": "engineering"}
]

/var @engineers = @filter(@users, "dept", "engineering")
/var @sortedByAge = @sortBy(@users, "age")
/var @names = @pluck(@users, "name")
/var @totalAge = @sum(@users, "age")

/show `Engineers: @engineers`
/show `Total age: @totalAge`
```

### mlld-dev/bundle

See full docs: [bundle](./llm/modules/bundle.mld.md#docs)

Bundle your project files for AI analysis or documentation:

```mlld
/import { xml as toXml, md, tree } from @mlld/bundle

/var @src_xml = @toXml("./src")
/show "Project structure in XML:"
/show `@src_xml`

/var @docs_md = @toMd("./docs")
/show "Documentation structure:"
/show `@docs_md`
```

### mlld/conditions

See full docs: [conditions](./llm/modules/conditions.mld.md#docs)

Essential utilities for building complex conditional logic in mlld:

```mlld
/import { equals, contains, gt, and, isEmpty } from @mlld/conditions

/var @users = ["alice", "bob", "charlie"]
/var @threshold = 10
/var @count = 15

/when @and(@gt(@count, @threshold), @contains(@users, "alice")) => /show "High count with Alice present"
/when @isEmpty(@users) => /show "No users found"
/when @equals(@count, 15) => /show "Exact match!"
```

### mlld/fix-relative-links

See full docs: [fix-relative-links](./llm/modules/fix-relative-links.mld.md#docs)

Recalculates relative links when moving content between directories:

```mlld
/import [fix-relative-links.mld.md]

/var @content = "See the [docs](../docs/guide.md) for details."

>> The function asks: "How do I get from dist/ to src/docs/guide.md?"
>> Answer: "../src/docs/guide.md"
/var @fixed = @fixRelativeLinks(@content, "src/modules", "dist")
>>                                        ↑                ↑
>>                   where content thinks it is    where it's actually going
```

### mlld/fm-dir

See full docs: [fm-dir](./llm/modules/fm-dir.mld.md#docs)

Grab directories with advanced frontmatter support:

```mlld
/import { grab, grabDir, grabFiles, filterByFrontmatter, sortByField, groupByField } from @mlld/fm-dir

>> Basic file grabbing
/var @modules = @grabDir("modules", "*.mld.md")
/var @allDocs = @grabFiles(".", "**/*.md")

>> Advanced usage with shadow environment
/var @published = @grab("posts", "*.md", { "fm": { "published": true } })
/var @byAuthor = @groupByField(@allDocs, "author")
/var @recent = @sortByField(@published, "date", "desc")

/show `Found @length(@modules) modules and @length(@published) published posts`
```

### mlld/fs

See full docs: [fs](./llm/modules/fs.mld.md#docs)

Provides basic file system checks that return truthy/falsy values for use with  conditions:

```mlld
/import { fileExists, dirExists, pathExists } from @mlld/fs

/when @fileExists("config.json") => /show "Config file found!"
/when @dirExists("src") => /show "Source directory exists"
/when @pathExists("README.md") => /show "README is available"
```

### mlld/http

See full docs: [http](./llm/modules/http.mld.md#docs)

Quick HTTP requests with automatic JSON handling:

```mlld
/import { http } from @mlld/http

/run @http.get("https://api.github.com/users/octocat")
/run @http.post("https://httpbin.org/post", {"message": "hello"})
/run @http.auth.get("https://api.github.com/user", @token)

/var @userData = @http.fetch.get("https://api.github.com/users/octocat")
/show `User: @userData.name`
```

### mlld/pipelog

See full docs: [pipelog](./llm/modules/pipelog.mld.md#docs)

Debug your pipelines by inserting logging between transformations:

```mlld
/import { log, logVerbose, logJson } from @mlld/pipelog

>> Simple pipeline debugging
/var @result = @data | @json | @log | @uppercase | @log

>> Verbose logging with full context
/var @processed = @fetchData() | @logVerbose | @transform

>> Structured JSON logging for parsing
/var @output = @input | @logJson | @process
```

All loggers output to stderr, ensuring your pipeline data flows unchanged to stdout.

### mlld/string

See full docs: [string](./llm/modules/string.mld.md#docs)

Common string operations:

```mlld
/import { title, camelCase, split, join, trim, includes } from @mlld/string

/var @name = "john doe smith"
/var @formatted = @title(@name)
/var @slug = @camelCase(@formatted)

/var @words = @split(@name, " ")
/var @rejoined = @join(@words, "-")

/when @includes(@name, "doe") => /show "Contains 'doe'"
/show `Formatted: @formatted`
```

### mlld/test

See full docs: [test](./llm/modules/test.mld.md#docs)

Test your mlld scripts with simple assertions:

```mlld
/import { eq, deepEq, ok, contains } from @mlld/test

/var @result = @calculateSum(2, 3)
/when @eq(@result, 5) => /show "✓ Sum calculation correct"

/var @data = { "name": "test", "items": [1, 2, 3] }
/when @deepEq(@data.items, [1, 2, 3]) => /show "✓ Array matches"

/when @contains(@output, "success") => /show "✓ Output contains success message"
```

### mlld/time

See full docs: [time](./llm/modules/time.mld.md#docs)

```mlld
/import { time } from @mlld/time

>> Use the built-in @now
/var @today = @time.format(@now, "YYYY-MM-DD")
/var @tomorrow = @time.add(@now, { days: 1 })

>> Compare dates
/when @time.compare.before(@dateA, @dateB) => /show "DateA is earlier"

>> Human-readable relative time
/var @updated = @time.relative(@lastModified)  >> "2 hours ago"

>> Work with durations
/var @workWeek = @time.duration.days(5)
/var @deadline = @time.add(@now, @workWeek)
```

---

All readmes are generated by the *llm/run/build.mld* script.

