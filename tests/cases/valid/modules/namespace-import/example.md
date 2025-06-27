---
description: Test module namespace imports
skip: true
skipReason: "Module namespace imports need proper registry mock setup"
---

# Module Namespace Import Test

This tests importing modules as namespaces.

// TODO: This test is skipped because the registry resolver returns URLs that need
// to be fetched, but our test infrastructure doesn't properly mock the full
// registry → URL → content fetch chain. The feature works but needs proper mocks.

## Auto-derived namespace

/import @test/utils

/show `Utils namespace: @utils`
/show `Version: @utils.version`

## Explicit namespace alias

/import @test/data as dataset

/show `Dataset namespace: @dataset`
/show `Type: @dataset.type`