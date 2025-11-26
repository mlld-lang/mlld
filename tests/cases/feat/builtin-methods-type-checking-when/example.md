# Test type checking in when expressions
/var @data1 = [1, 2, 3]
/var @data2 = { "name": "test" }
/var @data3 = "just a string"

/exe @processData(input) = when [
  @input.isArray() => "Processing array"
  @input.isObject() => "Processing object"
  @input.isString() => "Processing string"
  * => "Unknown type"
]

/show @processData(@data1)
/show @processData(@data2)
/show @processData(@data3)

# Test validation
/var @config = { "port": 8080, "hosts": ["localhost"] }
/var @invalidConfig = { "port": "not-a-number", "hosts": "not-an-array" }

/exe @validate(config) = when [
  !@config.port.isNumber() => "Port must be a number"
  !@config.hosts.isArray() => "Hosts must be an array"
  * => "Config valid"
]

/show @validate(@config)
/show @validate(@invalidConfig)
