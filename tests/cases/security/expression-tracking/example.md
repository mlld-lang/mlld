/var secret @secret = "  token-12345  "
/var @varChain = @secret.trim().slice(0, 6)
/var @varChainCtx = @varChain.ctx
/show `var-chained: @varChain (labels: @varChainCtx.labels)`

/var @templateChain = ::Peek: @secret.trim().slice(0, 6)::
/var @templateChainCtx = @templateChain.ctx
/show `template-chained: @templateChain (labels: @templateChainCtx.labels)`
