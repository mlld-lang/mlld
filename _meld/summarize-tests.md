>> oneshot --run 'npm test api/integration.test.ts' --task _meld/summarize-tests.md --system 'You read test results and output JSON' --model o3-mini

# Test Analysis Task

Provide concise and explicit JSON output based on the test result data provided using this format:

```json
{
   "tests": {
      "run": 68,
      "failing": 23,
      "passing": 45,
      "skipped": 15,
   },
   "failing": [
      {
         "test": "name of first failing test",
         "file": "path/to/file.test.ts",
         "details:" "description of error message"
      },
      {
         "test": "name of second failing test",
         "file": "path/to/file.test.ts",
         "details:" "description of error message"
      },
      ...
   ],
   "errors": [
      "Description of first error",
      "Description of second error",
      ...
   ]
}
```