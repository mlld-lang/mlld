> Test primitive values: numbers, booleans, and null

/var @integer = 42
/var @decimal = 19.99
/var @negative = -5
/var @active = true
/var @disabled = false
/var @empty = null

/show `Integer: @integer`
/show `Decimal: @decimal`
/show `Negative: @negative`
/show `Active: @active`
/show `Disabled: @disabled`
/show `Empty: @empty`

>> Test type preservation in JavaScript
/exe @typeOf(value) = js { return typeof value; }
/show `Type of integer: @typeOf(@integer)`
/show `Type of decimal: @typeOf(@decimal)`
/show `Type of boolean: @typeOf(@active)`
/show `Type of null: @typeOf(@empty)`

>> Test arithmetic with bare numbers
/exe @add(a, b) = js { return a + b; }
/var @sum = @add(@integer, 8)
/show `42 + 8 = @sum`

>> Test JavaScript type coercion
/var @stringConcat = @add("ham", 5)
/show `"ham" + 5 = @stringConcat`

>> Test in arrays and objects
/var @array = [@integer, @active, @empty]
/var @object = { count: 42, active: true, data: null }
/show `Array: @array`
/show `Object: @object`