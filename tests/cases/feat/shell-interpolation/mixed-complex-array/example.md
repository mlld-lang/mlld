# Test: Mixed Simple and Complex Elements

>> When an array has even one complex element (object or nested array),
>> the entire array should be JSON.stringify'd

/var @mixed = ["simple", {"complex": true}, "another"]
/run { echo @mixed }
