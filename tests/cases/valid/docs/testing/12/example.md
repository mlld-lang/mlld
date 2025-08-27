/exe @calculateDiscount(price, percent) = when [
  @price <= 0 => 0
  @percent < 0 => @price
  @percent > 100 => 0
  * => js { return @price * (100 - @percent) / 100 }
]

# Test normal cases
/var @test_normal_discount = @calculateDiscount(100, 10) == 90

# Test edge cases
/var @test_zero_price = @calculateDiscount(0, 10) == 0
/var @test_negative_price = @calculateDiscount(-50, 10) == 0
/var @test_negative_percent = @calculateDiscount(100, -5) == 100
/var @test_over_100_percent = @calculateDiscount(100, 150) == 0