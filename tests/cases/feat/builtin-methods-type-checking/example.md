/var @str = "hello"
/var @num = 42
/var @bool = true
/var @arr = [1, 2, 3]
/var @obj = { "key": "value" }
/var @nothing = null

# isString method
/show @str.isString()
/show @num.isString()
/show @arr.isString()

# isNumber method
/show @num.isNumber()
/show @str.isNumber()
/show @bool.isNumber()

# isBoolean method
/show @bool.isBoolean()
/show @num.isBoolean()
/show @str.isBoolean()

# isArray method
/show @arr.isArray()
/show @obj.isArray()
/show @str.isArray()

# isObject method
/show @obj.isObject()
/show @arr.isObject()
/show @str.isObject()

# isNull method
/show @nothing.isNull()
/show @str.isNull()
/show @num.isNull()

# isDefined method
/show @str.isDefined()
/show @num.isDefined()
/show @nothing.isDefined()
