# Guard can access @mx.taint

/exe @withExecTaint() = cmd { echo "exec-result" }

/guard @checkTaint before retryable = when [
  * => allow `taint:@mx.taint`
]

/var retryable @result = @withExecTaint()
/show @result
