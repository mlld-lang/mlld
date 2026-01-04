# Parallel pipeline group aggregates errors

/exe @seed() = "seed"
/exe @ok(input) = `ok:@input`
/exe @fail(input) = js { throw new Error("boom:" + input) }

/var @out = @seed() | || @ok(@input) || @fail(@input)

/show @out
/show `errors:@mx.errors.length`
/show `firstMessage:@mx.errors[0].message`
