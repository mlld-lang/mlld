# Test: Foreach with Complex Array Elements

>> Tests the exact pattern from user's issue #435
>> Each iteration should receive intact nested structure

/exe @echo(e) = run { echo @e }

/var @chunks = [[{"id": 1}, {"id": 2}], [{"id": 3}, {"id": 4}]]

/for @chunk in @chunks => show @echo(@chunk)
