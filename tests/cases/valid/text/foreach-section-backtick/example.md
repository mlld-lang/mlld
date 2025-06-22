/data @coreFiles = [
  {"name": "interpreter.ts", "path": "docs/interpreter.md"},
  {"name": "parser.ts", "path": "docs/parser.md"},
  {"name": "types.ts", "path": "docs/types.md"}
]
/text @codeIndex = foreach [@coreFiles.path # tldr] as `### [@coreFiles.name](./@coreFiles.path)`
/add @codeIndex