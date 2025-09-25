# JSON Formatting Preservation from Shell Scripts

Test that JSON output from shell scripts preserves its original formatting.

## Simple object - should preserve pretty printing from shell
/var @prettySimple = run {printf '{\n  "name": "Alice"\n}'}
/show @prettySimple

## Complex object - should remain pretty printed
/var @prettyComplex = run {printf '{\n  "name": "Alice",\n  "details": {\n    "age": 30,\n    "items": ["apple", "banana"]\n  }\n}'}  
/show @prettyComplex

## Minified object - should remain minified
/var @minifiedSimple = run {echo '{"name":"Bob"}'}
/show @minifiedSimple

## Empty object - formatting should be preserved
/var @prettyEmpty = run {printf '{\n\n}'}
/show @prettyEmpty