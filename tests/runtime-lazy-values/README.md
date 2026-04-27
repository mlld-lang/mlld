# Runtime Lazy Values Harness

Run this harness before Phase 1 and after each Phase 1-3 change:

```sh
npx tsx tests/runtime-lazy-values/harness.ts --records 160 --fields 12 --text-size 0 --sessions true
```

For larger local checks:

```sh
node --expose-gc ./node_modules/.bin/tsx tests/runtime-lazy-values/harness.ts --records 800 --fields 16 --text-size 1024 --sessions true
```

The harness emits one JSON object per stage:

- `wrap-object`
- `clone-with-metadata`
- `record-coercion`
- `field-access`
- `session-write-read`
- `display-serialize`

Use the semantic counters as the primary signal:

- `toJsonCalls` should not increase during `clone-with-metadata`.
- `textAccessors` should remain high until `display-serialize`.
- `nestedUrlCount` should remain stable, because URL provenance stays eager.
- `descriptorIdentities` should drop after descriptor interning.
- `factsourceArrayIdentities` and `projectionIdentities` should drop after record metadata interning.

RSS and heap values are supporting evidence only. Do not check in large harness output files.
