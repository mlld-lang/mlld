# Python shadow environment basic test

This test verifies Python shadow environment allows functions to call each other.

## Define shadow functions

/exe @add(a, b) = py {
return int(a) + int(b)
}

/exe @multiply(a, b) = py {
return int(a) * int(b)
}

## Set up shadow environment

/exe py = { add, multiply }

## Execute Python code that uses shadow functions

/run py {
sum_result = add(3, 4)
product_result = multiply(5, 6)
print(f"{sum_result}, {product_result}")
}
