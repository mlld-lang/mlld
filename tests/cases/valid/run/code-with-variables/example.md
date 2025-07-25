# Test /run js with variable arguments

/var @name = "Alice"
/var @age = 25
/var @fruits = ["apple", "banana", "cherry"]

/run js (@name, @age) {
  console.log(`Hello ${name}, you are ${age} years old`);
}

/run js (@fruits) {
  console.log(`Fruits: ${fruits.join(', ')}`);
}

/run bash (@name) {
  echo "Shell says hello to $name"
}