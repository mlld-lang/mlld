# Test: Complex Data in Template Context

>> Ensures complex data works when used in template interpolation
>> within shell commands

/var @items = [{"name": "item1"}, {"name": "item2"}]
/run { echo "Data: @items" }
