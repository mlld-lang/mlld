# Expression Operators Test

## Logical Operators in /var

/var @andResult = @a && @b
/var @orResult = @x || @y
/var @complexLogic = @a && @b || @c && @d
/var @withParens = (@a || @b) && (@c || @d)

## Comparison Operators in /var

/var @isEqual = @name == "Alice"
/var @notEqual = @status != "active"
/var @chainedComp = @a == @b && @c != @d

## Ternary Operator in /var

/var @simpleChoice = @isDev ? "development" : "production"
/var @nestedTernary = @env == "prod" ? "live" : @env == "staging" ? "test" : "dev"
/var @ternaryWithLogic = @isAdmin && @isActive ? @adminDash : @userDash

## Unary Operator in /var

/var @notActive = !@isActive
/var @complexNegation = !(@a && @b) || @c

## Expressions in /when

/when @isProduction && !@debugMode => /show "Production mode"
/when @user.role == "admin" || @user.role == "moderator" => /show "Has privileges"
/when @count > 0 && @count < 100 => /show "In range"
/when !@isLoggedIn => /show "Please log in"

## Complex Expressions

/var @result = (@a && @b) || (!@c && @d) ? @option1 : @option2
/when (@status == "active" || @override) && !@suspended => /run @process()

## Expression Precedence Test

# These should parse with correct precedence
/var @test1 = @a || @b && @c     # Should be: @a || (@b && @c)
/var @test2 = @a && @b || @c     # Should be: (@a && @b) || @c
/var @test3 = !@a && @b          # Should be: (!@a) && @b
/var @test4 = @a == @b && @c != @d  # Should be: (@a == @b) && (@c != @d)