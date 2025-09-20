# Expression Operators Test

## Logical Operators in /var

/var @andResult = @a && @b
/show @andResult
/var @orResult = @x || @y
/show @orResult
/var @complexLogic = @a && @b || @c && @d
/show @complexLogic
/var @withParens = (@a || @b) && (@c || @d)
/show @withParens

## Comparison Operators in /var

/var @isEqual = @name == "Alice"
/show @isEqual
/var @notEqual = @status != "active"
/show @notEqual
/var @chainedComp = @a == @b && @c != @d
/show @chainedComp

## Ternary Operator in /var

/var @simpleChoice = @isDev ? "development" : "production"
/show @simpleChoice
/var @nestedTernary = @env == "prod" ? "live" : @env == "staging" ? "test" : "dev"
/show @nestedTernary
/var @ternaryWithLogic = @isAdmin && @isActive ? @adminDash : @userDash
/show @ternaryWithLogic

## Unary Operator in /var

/var @notActive = !@isActive
/show @notActive
/var @complexNegation = !(@a && @b) || @c
/show @complexNegation

## Expressions in /when

/when @isProduction && !@debugMode => show "Production mode"
/when @user.role == "admin" || @user.role == "moderator" => show "Has privileges"
/when @count > 0 && @count < 100 => show "In range"
/when !@isLoggedIn => show "Please log in"

## Complex Expressions

/var @result = (@a && @b) || (!@c && @d) ? @option1 : @option2
/show @result
/when (@status == "active" || @override) && !@suspended => run @process()

## Expression Precedence Test

>> These should parse with correct precedence
/var @test1 = @a || @b && @c     << Should be: @a || (@b && @c)
/show @test1
/var @test2 = @a && @b || @c     << Should be: (@a && @b) || @c
/show @test2
/var @test3 = !@a && @b          << Should be: (!@a) && @b
/show @test3
/var @test4 = @a == @b && @c != @d  << Should be: (@a == @b) && (@c != @d)
/show @test4
