/var @num1 = "1"
/var @num2 = "2"
/exe @sum(a, b) = javascript {console.log(Number(a) + Number(b));}
/run @sum(1, 2)
