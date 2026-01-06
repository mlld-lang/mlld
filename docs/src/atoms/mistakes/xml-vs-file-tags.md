---
id: mistake-xml-vs-file-tags
title: XML vs File Tags
brief: Distinguish plain text tags from file references
category: mistakes
parent: mistakes
tags: [mistakes, files, xml, syntax]
related: [file-loading-basics]
related-code: []
updated: 2026-01-05
---

**`<thinking>` is plain text. `<file.txt>` (has `.`) is a file ref:**

```mlld
>> These are plain text (no . / * @)
<OVERVIEW>
<thinking>
</OVERVIEW>

>> These are file references
<README.md>
<src/*.ts>
<@base/config.json>
```
