# Test: JSON transformer basic formatting

## Format existing JSON
/text @data = @run {echo '{"name":"Alice","age":30,"city":"NYC"}'} with { pipeline: [@json] }
/add @data

## Convert markdown to JSON
/text @mdContent = [[
name: Alice
age: 30
city: NYC
]]

/text @converted = @run {echo "@mdContent"} with { pipeline: [@JSON] }
/add @converted

## Chain with other transformers
/text @result = @run {echo '{"items":[1,2,3]}'} with { pipeline: [@json] }
/add @result