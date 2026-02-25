/var secret @fallback = "fallback-secret"
/var @primary = null
/var @result = @primary ?? @fallback
/show @result
/show @result.mx.labels.length
/show @result.mx.labels[0]
/show @result.mx.taint.length
/show @result.mx.taint[0]
