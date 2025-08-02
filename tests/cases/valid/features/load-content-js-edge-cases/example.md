# Test LoadContentResult edge cases and error handling

## Setup test files
/var @content1 = `First file content`
/var @content2 = `Second file content`
/var @jsonContent = `{"name": "test", "value": 42}`

/output @content1 to file1.txt
/output @content2 to file2.txt  
/output @jsonContent to data.json

## Test 1: Array unwrapping
# Skip: Glob patterns not supported in tests
# /var @files = <file*.txt>

/exe @processArray(@arr) = js {
  if (!Array.isArray(arr)) return "FAIL: Not an array";
  if (arr.length !== 2) return "FAIL: Wrong length";
  if (typeof arr[0] !== 'string') return "FAIL: Not strings";
  return "PASS: " + arr.join(" | ");
}

# /run @processArray(@files)
/show "SKIP: Glob test"

## Test 2: JSON content handling
/var @jsonFile = <data.json>

/exe @parseJson(@content) = js {
  try {
    const data = JSON.parse(content);
    return `PASS: ${data.name} = ${data.value}`;
  } catch (e) {
    return "FAIL: Could not parse JSON";
  }
}

/run @parseJson(@jsonFile)

## Test 3: LoadContentResult metadata access
/var @file = <file1.txt>

/exe @checkMetadata(@content, @filename) = js {
  // When LoadContentResult is unwrapped, we lose metadata
  // This test shows parameters are unwrapped to content only
  return `Content length: ${content.length}, filename param: ${filename}`;
}

/run @checkMetadata(@file, @file.filename)

## Test 4: Multiple parameters
/exe @combine(@a, @b) = js {
  return `${a} + ${b}`;
}

/var @f1 = <file1.txt>
/var @f2 = <file2.txt>
/run @combine(@f1, @f2)

## Test 5: Shadow environment unwrapping
/exe @upper(@text) = js {
  return text.toUpperCase();
}

/exe js = { upper }

/exe @useShadow(@content) = js {
  return upper(content);
}

/var @testFile = <file1.txt>
/run @useShadow(@testFile)

## Cleanup
/run "rm -f file1.txt file2.txt data.json"