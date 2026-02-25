/var @payload = '{"type":"user-type","text":"user-text","data":"user-data","nested":{"ok":true}}' | @json
/show `top.type=@payload.type`
/show `top.text=@payload.text`
/show `top.data=@payload.data`
/show `mx.type=@payload.mx.type`
/show `mx.text=@payload.mx.text`
/show `mx.data.nested.ok=@payload.mx.data.nested.ok`
