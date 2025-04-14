# Plan: Fix CLI Build Errors

## 1. Goal

Resolve the `Cannot find module` and `Could not resolve` errors reported by `tsup` during the CJS and DTS builds for the CLI entry point (`cli/index.ts`). Ensure the CLI builds cleanly without errors.

## 2. Problem Context

After refactoring core types and DI configuration (`PLAN-DI-REFACTOR`), the main library code builds successfully, but the CLI build fails with errors indicating it cannot resolve relative imports within the `cli/` directory, such as:
*   `./commands/initCommand`
*   `./argsParser`
*   `./helpDisplay`
*   `./fileUtils`

This occurs for both the CJS bundle and the DTS type declaration generation.

## 3. Investigation Steps

1.  **Examine `tsup.config.ts`:**
    *   Focus on the configuration block specifically for the CLI entry (`entry: { cli: 'cli/cli-entry.ts' }`).
    *   Review `format` (currently `cjs`), `outDir`, `external`, `noExternal`, `tsconfig`, and especially `esbuildOptions`.
    *   Check how path aliases (`@core`, `@services`) vs. relative paths (`./commands`) are handled.
    *   Verify `resolveExtensions` settings.
2.  **Verify `cli/` File Structure & Exports:**
    *   Confirm that the files being imported (`cli/commands/initCommand.ts`, `cli/argsParser.ts`, etc.) exist at the correct relative paths.
    *   Check that these files correctly export the named members being imported (e.g., `export function initCommand ...`). Ensure export syntax is compatible with the CJS target and DTS generation.
3.  **Analyze Relative Imports in `cli/index.ts`:**
    *   Confirm the relative paths used in the `import` statements are correct.
    *   Experiment with including/excluding file extensions (`.js`, `.ts`) in the imports.
4.  **Research `tsup` Behavior:** Look into how `tsup` handles bundling, CJS/DTS output, and relative path resolution internally, especially when dealing with multiple entry points or mixed module types within dependencies.

## 4. Potential Solutions

*   Adjust import paths in `cli/index.ts` (remove/add extensions).
*   Modify `tsup.config.ts` CLI options:
    *   Experiment with `external` or `noExternal` for CLI-specific files.
    *   Adjust `outDir` or other path settings if bundling causes issues.
    *   Ensure `tsconfig.build.json` used by `tsup` has appropriate module/resolution settings.
*   Refactor exports in CLI utility/command files if they are incompatible.
*   Consider if a separate `tsconfig.cli.json` might be needed for the CLI build.

## 5. Next Steps

*   Begin Investigation Step 1: Examine `tsup.config.ts` for the CLI entry point configuration. 