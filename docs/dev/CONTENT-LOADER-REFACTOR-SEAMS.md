# CONTENT LOADER REFACTOR SEAMS

## BRANCH MAP
- Source reconstruction and policy read boundary:
  - `reconstructPath`, `reconstructUrl`, `readFileWithPolicy`
  - `enforceFilesystemAccess` and `MlldSecurityError` passthrough
- AST extraction boundary:
  - AST pattern normalization
  - name-list extraction vs content extraction
  - AST transform template application
- URL/file/glob loading boundary:
  - URL metadata and HTML conversion flow
  - single-file loading and section extraction
  - glob expansion and per-file result aggregation
- Section/transform/pipeline boundary:
  - section-list and section-name extraction
  - section rename templates
  - transform and pipe application order
- Finalization boundary:
  - `finalizeLoaderResult`
  - `wrapLoadContentValue`, structured wrapping, metadata merge

## MODULE BOUNDARIES
- `interpreter/eval/content-loader.ts` composes dependency wiring and delegates runtime execution to `ContentLoaderOrchestrator`.
- `interpreter/eval/content-loader/orchestrator.ts` routes branch execution for AST, URL, glob, and single-file paths.
- `interpreter/eval/content-loader/source-reconstruction.ts` owns source normalization and interpolation path reconstruction.
- `interpreter/eval/content-loader/ast-pattern-resolution.ts` and `interpreter/eval/content-loader/ast-variant-loader.ts` own AST pattern resolution and AST extraction variants.
- `interpreter/eval/content-loader/url-handler.ts`, `interpreter/eval/content-loader/single-file-loader.ts`, and `interpreter/eval/content-loader/glob-loader.ts` own transport and branch-specific loading behavior.
- `interpreter/eval/content-loader/section-utils.ts` owns section-name resolution, section-list extraction, and heading fallback extraction.
- `interpreter/eval/content-loader/transform-utils.ts` owns transform/template application behavior.
- `interpreter/eval/content-loader/finalization-adapter.ts` owns return-shape normalization, type/text inference, and metadata merge behavior.

## DATA FLOW
1. Source reconstruction resolves a path or URL candidate from AST source nodes.
2. Orchestration selects AST extraction, URL loading, glob loading, or single-file loading based on source shape.
3. Section extraction, transform application, and pipeline execution apply within each branch.
4. Finalization adapter normalizes the final return shape and merges metadata/security descriptors.

## DEPENDENCY DIRECTION CHECK
- Entry wiring points inward: `content-loader.ts -> orchestrator.ts -> stage modules`.
- Stage modules depend on shared utility modules and core interpreter services.
- Stage modules do not import `content-loader.ts`.
- Utility modules (`html-metadata`, section helpers, transform/finalization helpers) remain leaf-level within this feature slice.

## EXTRACTION HAZARDS
- Optional/null behavior depends on error-path shape (`optional: true` with glob/file branch differences).
- AST branches switch return shape (`string`, `array`, transformed text) before final wrapping.
- HTML conversion path changes content and metadata together; split points require parity checks on both.
- Glob section-list branch returns per-file heading buckets, not plain file content.
- Pipeline application happens at different layers across AST/url/file/glob branches and changes output type.
- Security descriptors merge from file/url metadata and audit sources during finalization.

## PHASE-0 BASELINE COMBINATIONS
- glob + section-list
- AST + transform template
- URL HTML conversion to markdown
- optional loader behavior (missing file and glob failure)
- security-error passthrough for policy/read enforcement
