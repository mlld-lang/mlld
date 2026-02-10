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
