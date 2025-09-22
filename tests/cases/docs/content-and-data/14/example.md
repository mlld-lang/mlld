/var @users = '[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]'

>> Parse inside function
/exe @filter1(users) = js {
  const data = JSON.parse(users);
  return data.filter(u => u.age > 25);
}
/run @filter1(@users)

>> Parse before passing
/exe @filter2(users) = js {
  return users.filter(u => u.age > 25);
}
/run @filter2(@users.data)   >> .data parses JSON
/run @filter2(@users.json)   >> .json is alias