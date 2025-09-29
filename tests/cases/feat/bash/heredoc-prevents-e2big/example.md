# Verify Heredoc Prevents E2BIG

This test confirms that heredocs are used for large variables to prevent E2BIG errors.

## Create multiple moderately large variables that together would exceed limits
/exe @rep(n, ch) = js { return String(ch).repeat(Number(n)); }
/var @data1 = @rep(100000, "a")
/var @data2 = @rep(100000, "b")
/var @data3 = @rep(100000, "c")

## Use all variables in a bash executable
/exe @verify(x, y, z) = sh {
  # Verify each variable has correct content
  echo "First char of x: $(echo "$x" | head -c 1)"
  echo "First char of y: $(echo "$y" | head -c 1)"
  echo "First char of z: $(echo "$z" | head -c 1)"
  echo "Total size: $(( ${#x} + ${#y} + ${#z} ))"
}

/show @verify(@data1, @data2, @data3)
