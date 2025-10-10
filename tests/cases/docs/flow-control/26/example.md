/exe @fetchA() = "A"
/exe @fetchB() = "B"
/exe @fetchC() = "C"

>> Leading || runs all three in parallel
/var @results = || @fetchA() || @fetchB() || @fetchC()
/show @results

>> Works in /run directive too
/run || @fetchA() || @fetchB() || @fetchC()

>> Control concurrency with (cap, delay) syntax
/var @limited = || @fetchA() || @fetchB() || @fetchC() (2, 100ms)