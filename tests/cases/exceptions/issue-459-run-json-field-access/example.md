>> Issue #459: Multiple JSON field access in run command returns whole string
>> https://github.com/mlld-lang/mlld/issues/459
>>
>> When a JSON string variable is passed to an /exe function that uses run { },
>> accessing multiple .field properties returns the whole JSON string instead
>> of individual field values.

/exe @display(entry) = run { echo @entry.a @entry.b @entry.c }
/var @entry = '{"a":1,"b":2,"c":3}'

>> Expected: "1 2 3"
>> Actual: '{"a":1,"b":2,"c":3} {"a":1,"b":2,"c":3} {"a":1,"b":2,"c":3}'
/show @display(@entry)
