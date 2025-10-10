# Test: LoadContentResult to Shell Command

>> Tests that LoadContentResult from file loading is properly classified
>> when passed to shell commands

/var @loaded = <data.json>
/run { echo @loaded }
