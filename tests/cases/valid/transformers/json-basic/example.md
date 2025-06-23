# Test: JSON transformer basic formatting

## Format existing JSON
/var @data = @run {echo '{"name":"Alice","age":30,"city":"NYC"}'} with { pipeline: [@json] }
/show @data

## Convert markdown to JSON
/var @mdContent = [[
name: Alice
age: 30
city: NYC
]]

/var @converted = @run {echo "@mdContent"} with { pipeline: [@JSON] }
/show @converted

## Chain with other transformers
/var @result = @run {echo '{"items":[1,2,3]}'} with { pipeline: [@json] }
/show @result