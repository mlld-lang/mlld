/exe @greet(name, title) = `Hello, @title @name!`
/exe @calculate(x, y) = js { return @x * @y + 10 }

/show @greet("Smith", "Dr.")       # "Hello, Dr. Smith!"
/show @calculate(5, 3)             # 25