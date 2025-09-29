/exe @fetchA() = "A"
/exe @fetchB() = "B"
/exe @fetchC() = "C"

# Leading || runs all three in parallel
/var @results = || @fetchA() || @fetchB() || @fetchC()
/show @results