/var secret @secret = "top-secret"
/var @copy = @secret.trim()
/var @copyCtx = @copy.ctx
/show `Copy labels: @copyCtx.labels`
