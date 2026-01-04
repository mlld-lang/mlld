/exe @other(value) = js { return value + "-tail" }
/exe @pipeDelegate(value) = @other(value) | cmd { tr a-z A-Z }
/show @pipeDelegate("abc")
