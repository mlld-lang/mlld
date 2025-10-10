# Test: StructuredValue Wrapped Complex Data

>> Tests that StructuredValue wrappers are properly unwrapped
>> before complexity detection

/exe @make_nested() = js { return [[1,2], [3,4]]; }

/var @wrapped = @make_nested() | @json
/run { echo @wrapped }
