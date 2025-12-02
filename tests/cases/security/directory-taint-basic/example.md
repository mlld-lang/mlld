/var @config = <dir-taint/dir-taint-config.txt>

/var @taint = @config.ctx.taint | @json
/var @labels = @config.ctx.labels | @json
/var @sources = @config.ctx.sources | @json

/show `Taint: @taint`
/show `Labels: @labels`
/show `Sources: @sources`
