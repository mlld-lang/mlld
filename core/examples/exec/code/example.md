@text a = "1"
@text b = "2"
@exec sum (a, b) = @run javascript [console.log(Number(a) + Number(b));]
@run @sum (1, 2)
