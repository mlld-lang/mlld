/exe @emitA() = sh { echo "A" }
/exe @emitB() = sh { echo "B" }
/exe @emitC() = sh { echo "C" }

/var @res = stream @emitA() || stream @emitB() || stream @emitC()
/show @res
