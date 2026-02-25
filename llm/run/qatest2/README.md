# qatest2

QA testing module

## Usage

```bash
mlld run qatest2
mlld run qatest2 --parallel 8
mlld run qatest2 --filter "pattern"
```

## Structure

```
qatest2/
  index.mld            Entry point
  lib/context.mld      Helper functions
  prompts/worker.att   Prompt template
  module.yml           Module manifest
```

## Customizing

1. Define your work items in `index.mld` (or load from a manifest file)
2. Edit `prompts/worker.att` to customize the LLM prompt
3. Add more helpers in `lib/` as needed

## License

CC0 - Public Domain
