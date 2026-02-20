/var pii @name = "John Doe"
/var @flag = true
/var @arr = [@flag ? @name : "x"]
/var @obj = {"k": @flag ? @name : "x"}
/show @arr.mx.labels
/show @obj.mx.labels
