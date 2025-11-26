/var @str = "hello"
/var @num = 42
/var @bool = true
/var @arr = [1, 2, 3]
/var @obj = { "key": "value" }
/var @nothing = null

# isString
/show @str.isString()
/show @num.isString()
/show @arr.isString()

# isNumber
/show @num.isNumber()
/show @str.isNumber()

# isBoolean
/show @bool.isBoolean()
/show @num.isBoolean()

# isArray
/show @arr.isArray()
/show @obj.isArray()

# isObject
/show @obj.isObject()
/show @arr.isObject()

# isNull
/show @nothing.isNull()
/show @str.isNull()

# isDefined - existing values
/show @str.isDefined()
/show @nothing.isDefined()

# isDefined - missing variable
/show @nonexistent.isDefined()

# isDefined - missing field
/show @obj.missing.isDefined()
