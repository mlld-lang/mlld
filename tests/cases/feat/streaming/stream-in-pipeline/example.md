/exe @emitMid() = sh { echo "mid" }
/exe @appendX(s) = js { return s + "x"; }

/var @res = stream @emitMid() | @appendX
/show @res
