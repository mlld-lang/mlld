/exe @getScore(x) = when [
  @x > 10 => 1.5
  @x > 5 => 0.6
  * => 0.5
]

/show @getScore(15)
/show @getScore(7)
/show @getScore(3)

>> Test in objects
/var @results = {
  high: @getScore(15),
  medium: @getScore(7),
  low: @getScore(3)
}
/show @results | @json
