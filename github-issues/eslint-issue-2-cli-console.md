# Issue: ESLint Phase 2 - CLI Console Output

## Summary
Add ESLint exemption for console.log usage in CLI commands, which legitimately need console output for user interaction.

## Current State
- ~300 warnings for console.log usage in cli/commands/*.ts
- CLI tools need console output to communicate with users
- Current rule only allows console.warn and console.error

## Tasks
- [ ] Add ESLint override in eslint.config.mjs for CLI directory
- [ ] Allow console.log specifically for cli/commands/**/*.ts
- [ ] Verify all CLI commands still output correctly
- [ ] Consider if cli/utils/* also needs exemption

## Code Changes
Add to eslint.config.mjs:
```javascript
{
  files: ['cli/commands/**/*.ts'],
  rules: {
    'no-console': 'off', // CLI commands need console output
  }
}
```

## Affected Files
- `cli/commands/auth.ts` (~35 warnings)
- `cli/commands/info.ts` (~15 warnings)
- `cli/commands/init.ts` (~5 warnings)
- `cli/commands/install.ts` (~15 warnings)
- `cli/commands/ls.ts` (~20 warnings)
- `cli/commands/publish.ts`
- `cli/commands/registry.ts`

## Success Criteria
- No console warnings in CLI command files
- CLI commands still produce expected output
- Clear documentation about why this exemption exists

## Time Estimate
1-2 hours

## Why This Matters
- CLI tools fundamentally need console output
- Reduces warning count by ~300
- Pragmatic exemption for legitimate use case