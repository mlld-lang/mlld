# Python Runtime Error Test

Tests that Python runtime errors (like ZeroDivisionError) are properly reported.

/exe @divide() = py {
result = 10 / 0
print(result)
}

/show @divide()
