/var @msg = "hello_world_test"
/var @result = @msg.split("_")[0].toUpperCase()
/show @result

/var @chain = @msg.split("_")[1].trim()
/show @chain
