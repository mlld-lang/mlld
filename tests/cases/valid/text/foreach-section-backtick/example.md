/var @coreFiles = [
  {"name": "interpreter.ts", "path": "docs/interpreter.md"},
  {"name": "parser.ts", "path": "docs/parser.md"},
  {"name": "types.ts", "path": "docs/types.md"}
]
/var @codeIndex = foreach [@coreFiles.path # tldr] as `### [@coreFiles.name](./@coreFiles.path)`
/show @codeIndex