# Parameter Shadowing Test

This test ensures that function parameters can shadow variables in the parent scope.

/exe @compareFunc(@date1, @date2) = js {
  return date1 < date2 ? date1 : date2;
}

>> Define local variables that have the same names as function parameters
/var @date1 = "2024-01-01"
/var @date2 = "2024-12-31"

>> Call the function with different values - parameters should shadow the local variables
/var @result = @compareFunc("2023-06-15", "2023-08-20")
/show `Earliest date: @result`

>> Local variables should still have their original values
/show `Local date1: @date1`
/show `Local date2: @date2`

