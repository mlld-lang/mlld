# Test: Undefined Variable in Shell Command

>> Tests that undefined/missing variables interpolate as empty strings
>> and are classified as simple (not complex)

/var @defined = "exists"

>> @missing is not defined, should become empty string
/run { echo @defined @missing @defined }
