/var secret @token = "secret-42"
/var @items = [@token]
/exe @echo(value) = cmd { printf "@value" }

/for @item in @items [
  let @out = @echo(@item)
  show @item.mx.labels
  show @item.mx.taint
  show @out.mx.labels
  show @out.mx.taint
]
