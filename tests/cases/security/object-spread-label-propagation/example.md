/var secret @sourceObj = { token: "spread-secret", env: "prod" }
/var @copy = { ...@sourceObj }
/show @copy.token
/show @copy.mx.labels.length
/show @copy.mx.labels[0]
/show @copy.mx.taint.length
/show @copy.mx.taint[0]
