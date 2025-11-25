>> Issue #461: when expression loses JSON data on passthrough
>> https://github.com/mlld-lang/mlld/issues/461
>>
>> When JSON data passes through a /exe function using when [ ],
>> the structured data is lost and becomes an empty string.

/exe @passthrough(req) = when [
  * => @req
]

/var @data = [{"foo": 1, "bar": 2}]

>> Expected: @data preserved through passthrough
/var @result = @passthrough(@data)

>> This should show the JSON array
/show @result

>> This should show 1
/show @result[0].foo
