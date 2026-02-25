/var secret @token = "sk-123"
/var pii @email = "user@example.com"
/var @message = ::token=@token email=@email::
/show @message
/show @message.mx.labels.length
/show @message.mx.labels[0]
/show @message.mx.labels[1]
/show @message.mx.taint.length
/show @message.mx.taint[0]
/show @message.mx.taint[1]
