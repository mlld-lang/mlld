# Expression Operators Parsing Test

Tests that expression operators parse correctly (not evaluation).

## Logical Operators in /var

/var @a = true
/var @b = false
/var @c = true
/var @d = false

/var @andResult = @a && @b
/var @orResult = @a || @b
/var @chainedAnd = @a && @b && @c
/var @chainedOr = @a || @b || @c
/var @mixedLogic = @a && @b || @c && @d

## Comparison Operators in /var

/var @name = "Alice"
/var @status = "active"

/var @isEqual = @name == "Alice"
/var @notEqual = @status != "inactive"
/var @chainedComp = @name == "Alice" && @status == "active"

## Ternary Operator in /var

/var @isDev = false
/var @simpleChoice = @isDev ? "development" : "production"
/var @nestedTernary = @status == "active" ? "online" : @status == "pending" ? "waiting" : "offline"

## Unary Operator in /var

/var @isActive = true
/var @notActive = !@isActive
/var @doubleNot = !!@isActive

## Show Results

/show "Tests completed - if this shows, parsing worked!"