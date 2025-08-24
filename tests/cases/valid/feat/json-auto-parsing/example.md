/var @jsonString = run {echo '{"items": ["apple", "banana", "cherry"], "count": 3}'}
/var @jsonArray = run {echo '[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]'}

/exe @formatItems(data) = js {
  return data.items.map(item => `- ${item}`).join('\n');
}

/exe @formatUsers(users) = js {
  return users.map(user => `${user.name} is ${user.age} years old`).join('\n');
}

/show @formatItems(@jsonString)

/show @formatUsers(@jsonArray)

