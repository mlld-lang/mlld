/var @a = "first"
/var @b = ""
/var @c = "third"

/var @list = [@a, @b?, @c]
/show @list
>> ["first", "third"] - @b was omitted because it's falsy