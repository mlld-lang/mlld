/exe @emitL() = sh { echo "L" }
/exe @emitR() = sh { echo "R" }

/var @res = stream @emitL() || stream @emitR()
/show @res
