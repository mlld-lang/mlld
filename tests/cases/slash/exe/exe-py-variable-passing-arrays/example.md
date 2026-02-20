# Python Variable Passing - Arrays

Tests passing array/list variables to Python executables.

## Test simple array parameter

/var @numbers = [1, 2, 3, 4, 5]

/exe @sumArray(arr) = py {
total = sum(arr)
print(total)
}

/var @sum = @sumArray(@numbers)
/show `Sum: @sum`

## Test array of strings

/var @names = ["Alice", "Bob", "Charlie"]

/exe @joinNames(arr) = py {
result = ", ".join(arr)
print(result)
}

/var @joined = @joinNames(@names)
/show @joined

## Test array iteration

/var @items = ["apple", "banana", "cherry"]

/exe @countItems(arr) = py {
print(f"Count: {len(arr)}")
for i, item in enumerate(arr):
    print(f"  {i+1}. {item}")
}

/var @output = @countItems(@items)
/show @output

## Test array of objects

/var @people = [
  {"name": "Alice", "age": 25},
  {"name": "Bob", "age": 30}
]

/exe @listPeople(arr) = py {
for person in arr:
    print(f"{person['name']} is {person['age']}")
}

/var @peopleList = @listPeople(@people)
/show @peopleList
