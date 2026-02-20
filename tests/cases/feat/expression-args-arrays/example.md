/var @score = 0.85
/exe @floor(n) = js { return Math.floor(n); }

/var @tagLevel = @floor(@score * 10)
/var @level = @score > 0.5 ? "high" : "low"
/var @arr = [@score > 0.5 ? "high" : "low", @score * 2]

/show @tagLevel
/show @level
/show @arr | @json
