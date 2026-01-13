# Test: Nested array normalization in display

When arrays contain nested arrays, the inner arrays should also be
normalized properly (e.g., StructuredValues inside nested arrays
should be converted to their text or data representations).

/var @nested = [["a", "b"], ["c", "d"]]
/show @nested

/var @result = for @row in @nested => @row
/show @result
