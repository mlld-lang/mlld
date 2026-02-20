/var @condValue = "present"
/var @condEmpty = ""

/var @obj1 = { "field"?: @condValue }
/var @obj2 = { "field"?: @condEmpty }

/show @obj1
/show @obj2
