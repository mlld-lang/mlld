# Python Multi-line Code Test

This test verifies multi-line Python code blocks work correctly.

## Test multi-statement function

/exe @factorial(n) = py {
n = int(n)
result = 1
for i in range(1, n + 1):
    result *= i
print(result)
}

/var @fact5 = @factorial(5)
/show `5! = @fact5`

## Test function with conditionals

/exe @classify(x) = py {
x = int(x)
if x < 0:
    print("negative")
elif x == 0:
    print("zero")
else:
    print("positive")
}

/var @neg = @classify(-5)
/var @zero = @classify(0)
/var @pos = @classify(10)

/show `@neg, @zero, @pos`

## Test function with multiple prints

/exe @countDown(start) = py {
start = int(start)
for i in range(start, 0, -1):
    print(i)
print("blast off!")
}

/var @countdown = @countDown(3)
/show @countdown
