# Test: Multiple Complex Parameters

>> Tests multiple complex parameters in same command

/var @obj1 = {"a": 1}
/var @obj2 = {"b": 2}
/run { echo @obj1 @obj2 }
