# Test: Complex Value Within Single Quotes

>> Ensures complex data stays intact when interpolated inside single-quoted command arguments

/var @payload = {"id": 1, "name": "Alice"}
/var @sq = "'"
/run { echo @sq@payload@sq }
