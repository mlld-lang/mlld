# Test: Complex Value With Apostrophe Inside Single Quotes

>> Ensures apostrophes inside complex data remain intact when single-quoted

/var @payload = {"name": "O'Reilly", "id": 42}
/var @sq = "'"
/run { echo @sq@payload@sq }
