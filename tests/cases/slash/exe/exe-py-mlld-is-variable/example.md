# Python mlld.is_variable() Helper Tests

Tests the mlld.is_variable() helper function for checking if a value is a Variable.

## Test array is_variable

/var @colors = ["red", "green", "blue"]

/exe @checkArrayIsVar(arr) = py {
result = mlld.is_variable(arr)
print("True" if result else "False")
}

/var @isVar = @checkArrayIsVar(@colors)
/show `Array is variable: @isVar`

## Test object is_variable

/var @person = { "name": "Alice", "age": 30 }

/exe @checkObjectIsVar(obj) = py {
result = mlld.is_variable(obj)
print("True" if result else "False")
}

/var @objIsVar = @checkObjectIsVar(@person)
/show `Object is variable: @objIsVar`

## Test primitive is_variable with name

/var @greeting = `hello`

/exe @checkPrimitiveIsVar(val) = py {
result = mlld.is_variable(val, "val")
print("True" if result else "False")
}

/var @primIsVar = @checkPrimitiveIsVar(@greeting)
/show `Primitive with name is variable: @primIsVar`

## Test raw Python value is not variable

/exe @checkRawIsVar() = py {
raw_list = [1, 2, 3]
result = mlld.is_variable(raw_list)
print("True" if result else "False")
}

/var @rawIsVar = @checkRawIsVar()
/show `Raw Python list is variable: @rawIsVar`

## Test mlld.get_type() on Variable

/var @numbers = [1, 2, 3]

/exe @getVarType(arr) = py {
t = mlld.get_type(arr)
print(t if t else "None")
}

/var @varType = @getVarType(@numbers)
/show `Variable type: @varType`

## Test mlld.get_metadata() on Variable

/exe @getVarMetadata(obj) = py {
meta = mlld.get_metadata(obj)
print("has_metadata" if meta else "no_metadata")
}

/var @hasMeta = @getVarMetadata(@person)
/show `Metadata check: @hasMeta`
