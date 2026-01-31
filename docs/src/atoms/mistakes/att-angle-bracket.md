---
id: mistake-att-angle-bracket
title: Loading .att with Angle Brackets
brief: Never load .att files with angle brackets
category: mistakes
parent: mistakes
tags: [mistakes, templates, att, interpolation]
related: [templates-external, exe-simple, modules-import-templates]
related-code: []
updated: 2026-01-12
---

Never load `.att` template files with angle brackets and manual interpolation.

```mlld
>> Wrong - loads raw text, no interpolation
var @tpl = <prompts/welcome.att>
var @result = @tpl.replace("@name", @userName)  >> manual, error-prone

>> Correct - automatic interpolation with exe params
exe @welcome(name) = template "./prompts/welcome.att"
show @welcome(@userName)
```

The `exe ... = template` form:

- Automatically makes function parameters available as `@param` in the template
- Supports `/for`/`/end` blocks, pipes, and file references inside the template
- Handles escaping and edge cases correctly

Using angle brackets treats the `.att` file as plain text with no interpolation.
