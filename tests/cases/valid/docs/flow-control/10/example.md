/var @numbers = [1, 2, 3, 4]
/var @doubled = for @n in @numbers => js { return @n * 2 }
/show @doubled