/var @obj = {"a": 1, "b": 2, "c": 3}

/show @obj.mx.keys
/show @obj.mx.values
/show @obj.mx.entries

/var @keys_via_for = for @k in @obj.mx.keys => @k
/show @keys_via_for
