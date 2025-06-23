/var @a = "1"
/var @b = "2"
/exe @sum(a, b) = javascript {console.log(Number(a) + Number(b));}
/run @sum (1, 2)
