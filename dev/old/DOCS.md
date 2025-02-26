Please break this up into user-facing docs for each of the meld directives:

```
docs/index.md
docs/examples/index.md
docs/examples/testing.md
docs/examples/maintenance.md
docs/examples/decision-making.md
docs/examples/build.md

docs/cli/index.md
docs/cli/execution/embed.md
docs/cli/execution/import.md
docs/cli/definition/path.md
docs/cli/definition/text.md
docs/cli/definition/define.md
docs/cli/definition/data.md
docs/cli/definition/import.md

docs/api/index.md
docs/api/execution/embed.md
docs/api/execution/import.md
docs/api/definition/path.md
docs/api/definition/text.md
docs/api/definition/define.md
docs/api/definition/data.md
docs/api/definition/import.md

docs/dev/index.md
docs/dev/meld-ast.md
docs/dev/meld-spec.md
docs/dev/meld-interpreter/index.md
docs/dev/meld-interpreter/architecture.md
docs/dev/meld-interpreter/pipeline.md
docs/dev/meld-interpreter/testing.md
docs/dev/meld-interpreter/debugging.md

```

Each document should
- include meld-spec types
- match with meld-ast grammar
- match with 

In any case where a feature does not 