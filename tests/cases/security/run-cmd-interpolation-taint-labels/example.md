/var secret @token = "run-secret-42"
/var @result = run cmd {echo "@token"}
/show @result.mx.labels.length
/show @result.mx.labels[0]
/show @result.mx.taint.length
/show @result.mx.taint[0]
/show @result.mx.taint[1]
