/var @payload = '{"stance":"approved","mx":"user-mx","nested":{"score":9}}' | @json
/var @textTopLevelMissing = @payload.text == null
/show `text_top_level_missing=@textTopLevelMissing`
/show `mx.data.stance=@payload.mx.data.stance`
/show `mx.data.mx=@payload.mx.data.mx`
/show `direct=@payload.stance`
/show `via_mx=@payload.mx.data.stance`
/var @plain = run { echo hello } | @trim
/show `plain.mx.text=@plain.mx.text`
/show `plain.mx.data=@plain.mx.data`
