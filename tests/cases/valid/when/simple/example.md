@exec is_true() = @run [echo "true"]
@when @is_true() => @add "Success!"