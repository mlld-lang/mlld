# Test: Three Levels of Nesting

>> Extreme case: very deep nesting to ensure recursive unwrapping works

/var @triple = [[[{"x": 1}]]]
/run { echo @triple }
