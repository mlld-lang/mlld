# Test type checking methods work with variables
/var @data1 = [1, 2, 3]
/var @data2 = { "name": "test" }
/var @data3 = "just a string"

# Check each type
/var @isData1Array = @data1.isArray()
/var @isData2Object = @data2.isObject()
/var @isData3String = @data3.isString()

/show @isData1Array
/show @isData2Object
/show @isData3String

# Negative checks
/var @isData1Object = @data1.isObject()
/var @isData2Array = @data2.isArray()
/var @isData3Number = @data3.isNumber()

/show @isData1Object
/show @isData2Array
/show @isData3Number
