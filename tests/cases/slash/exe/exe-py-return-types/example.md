# Python Return Types Test

This test verifies different Python return types work correctly.

## Test string return

/exe @getString() = py {
print("hello world")
}

/var @str = @getString()
/show `String: @str`

## Test number return

/exe @getNumber() = py {
print(42)
}

/var @num = @getNumber()
/show `Number: @num`

## Test float return

/exe @getFloat() = py {
print(3.14159)
}

/var @fl = @getFloat()
/show `Float: @fl`

## Test list return as JSON

/exe @getList() = py {
import json
print(json.dumps([1, 2, 3, 4, 5]))
}

/var @list = @getList()
/show `List: @list`

## Test dict return as JSON

/exe @getDict() = py {
import json
print(json.dumps({"name": "Alice", "age": 30}))
}

/var @dict = @getDict()
/show `Dict: @dict`

## Test boolean return

/exe @getBool() = py {
print("true")
}

/var @bool = @getBool()
/show `Bool: @bool`
