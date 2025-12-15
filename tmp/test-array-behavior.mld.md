#!/usr/bin/env mlld
# Critical Array Behavior Canary Test
# Run this before/after Phase 2.3 migration to verify array interpolation behavior
#
# Expected output is captured in tmp/baseline-canary-output.txt
# Run: mlld run test-array-behavior.mld > tmp/baseline-canary-output.txt
#
# After migration, re-run and diff against baseline to detect regressions

## Test 1: Basic glob concatenation (LoadContentResult array)
/var @files = <tests/cases/feat/alligator/alligator-glob-concat/glob-concat-*.md>

### Test 1a: Direct interpolation
Expected: Files concatenate with \n\n separator
Actual output:
@files

---

### Test 1b: Array indexing
First file:
@files[0]

Second file:
@files[1]

---

### Test 1c: Array length
File count: @files.length

---

### Test 1d: Array .content field access
Content via .content:
@files.content

---

## Test 2: Renamed content array (glob as transform)
/var @renamed = <tests/cases/feat/alligator/glob-as-transform/glob-test-*.md> as "<>.ctx.filename"

### Test 2a: Direct interpolation of renamed array
Filenames:
@renamed

---

### Test 2b: Array operations on renamed content
First filename: @renamed[0]
Array length: @renamed.length

---

### Test 2c: Join operation on renamed array
/show @renamed.join(" | ")

---

## Test 3: File reference glob patterns
/var @refs = <tests/cases/feat/alligator/glob-as-transform/glob-test-*.md>

### Test 3a: Direct file reference interpolation
File references:
@refs

---

### Test 3b: File reference in template string
/show "Files found: @refs.length"

---

## Test 4: Array in template context
/var @templateFiles = <tests/cases/feat/alligator/alligator-glob-concat/glob-concat-*.md>

### Test 4a: Variable interpolation in template
/show "File contents: @templateFiles"

---

### Test 4b: Nested interpolation
/show "Count is @templateFiles.length and first is @templateFiles[0]"

---

## Test 5: Mixed array operations
/var @mixed = <tests/cases/feat/alligator/glob-as-transform/glob-test-*.md>

### Test 5a: Multiple operations
/show "Total: @mixed.length files"
/show @mixed[0]
/show @mixed.join(", ")

---

## Test 6: Empty array handling
/var @empty = <no-match-pattern-*.xyz>

### Test 6a: Empty array length
Empty count: @empty.length

---

### Test 6b: Empty array interpolation
Empty content:
@empty

---

## Test 7: LoadContentResultArray type preservation
/var @typeTest = <tests/cases/feat/alligator/glob-as-transform/glob-test-*.md>

### Test 7a: Verify array structure is maintained
Type test - length: @typeTest.length
Type test - first element: @typeTest[0]

---

## END OF CANARY TEST
All tests completed successfully
