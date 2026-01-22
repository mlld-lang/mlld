# Python Variable Array Access Tests

Tests array indexing and iteration on Variable-wrapped arrays in Python executables.

## Test array indexing

/var @colors = ["red", "green", "blue", "yellow"]

/exe @getByIndex(arr, idx) = py {
print(arr[idx])
}

/var @first = @getByIndex(@colors, 0)
/var @third = @getByIndex(@colors, 2)
/show `First: @first, Third: @third`

## Test negative indexing

/exe @getLast(arr) = py {
print(arr[-1])
}

/var @last = @getLast(@colors)
/show `Last: @last`

## Test array slicing

/exe @getSlice(arr, start, end) = py {
result = arr[start:end]
print(", ".join(result))
}

/var @slice = @getSlice(@colors, 1, 3)
/show `Slice[1:3]: @slice`

## Test iteration with enumerate

/var @fruits = ["apple", "banana", "cherry"]

/exe @enumerateItems(arr) = py {
for i, item in enumerate(arr):
    print(f"{i}: {item}")
}

/var @enumOutput = @enumerateItems(@fruits)
/show @enumOutput

## Test list comprehension

/exe @doubleNumbers(arr) = py {
doubled = [x * 2 for x in arr]
print(doubled)
}

/var @nums = [1, 2, 3, 4, 5]
/var @doubled = @doubleNumbers(@nums)
/show `Doubled: @doubled`

## Test filter with list comprehension

/exe @filterEvens(arr) = py {
evens = [x for x in arr if x % 2 == 0]
print(evens)
}

/var @evens = @filterEvens(@nums)
/show `Evens: @evens`

## Test len() on Variable array

/exe @getLength(arr) = py {
print(len(arr))
}

/var @len = @getLength(@colors)
/show `Length: @len`

## Test in operator

/exe @checkContains(arr, item) = py {
print("yes" if item in arr else "no")
}

/var @hasGreen = @checkContains(@colors, "green")
/var @hasPurple = @checkContains(@colors, "purple")
/show `Has green: @hasGreen, Has purple: @hasPurple`
