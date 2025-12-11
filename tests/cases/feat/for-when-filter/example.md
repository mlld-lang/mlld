/var @xs = [-2, 0, 1, 5, 11]

/var @filtered = for @x in @xs when [
  @x > 0 => @x;
  @x > 10 => "big"
]
/show @filtered | @json

/var @inline = for @x in @xs when @x > 0 => "pos-@x"
/show @inline | @json
