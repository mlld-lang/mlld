/var @config = <dir-taint-nested/level-one/level-two/dir-taint-nested-config.txt>

/var @taint = @config.ctx.taint | @json
/var @labels = @config.ctx.labels | @json
/var @sources = @config.ctx.sources | @json

/show `Taint: @taint`
/show `Labels: @labels`
/show `Sources: @sources`
