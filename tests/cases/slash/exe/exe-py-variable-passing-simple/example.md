# Python Variable Passing - Simple Types

Tests passing string and number variables to Python executables.

## Test string parameter

/var @name = `Alice`

/exe @greetPerson(n) = py {
print(f"Hello, {n}!")
}

/var @result = @greetPerson(@name)
/show @result

## Test number parameter

/var @num = 42

/exe @doubleNumber(x) = py {
print(int(x) * 2)
}

/var @doubled = @doubleNumber(@num)
/show `Doubled: @doubled`

## Test multiple parameters

/var @firstName = `Bob`
/var @lastName = `Smith`
/var @age = 30

/exe @formatPerson(first, last, years) = py {
print(f"{first} {last} is {years} years old")
}

/var @personInfo = @formatPerson(@firstName, @lastName, @age)
/show @personInfo
