/exe @pipeJs(value) = js { return "hi-" + value } | cmd { tr a-z A-Z }
/show @pipeJs("there")
