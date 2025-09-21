/var @name = "Alice"
/var @user = {"role": "admin", "id": 123}

>> Backticks (primary template syntax)
/var @msg1 = `Hello @name!`
/var @msg2 = `User @user.role has ID @user.id`

>> Double colon for escaping backticks
/var @code = ::Use `mlld run` with user @name::

>> Triple colon for many @ symbols (use {{}} syntax)
/var @social = :::Hey @{{name}}, check out {{user.role}}!:::