# Parallel pipeline group aggregates errors

/exe @seed() = "seed"
/exe @ok(input) = `ok:@input`
/exe @fail(input) = js { throw new Error("boom:" + input) }

/var @out = @seed() | || @ok(@input) || @fail(@input)

/show @out
/show `errors:@ctx.errors.length`
/show `firstMessage:@ctx.errors[0].message`
