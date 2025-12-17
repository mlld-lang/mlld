/var @config = <dir-taint/dir-taint-config.txt>

/var @taint = @config.mx.taint | @json
/var @labels = @config.mx.labels | @json
/var @sources = @config.mx.sources | @json

/show `Taint: @taint`
/show `Labels: @labels`
/show `Sources: @sources`
