# Python Variable Passing - Objects

Tests passing object/dict variables to Python executables with metadata.

## Test simple object parameter

/var @person = {
  "name": "Alice",
  "age": 30
}

/exe @describePerson(p) = py {
print(f"{p['name']} is {p['age']} years old")
}

/var @desc = @describePerson(@person)
/show @desc

## Test nested object

/var @config = {
  "server": {
    "host": "localhost",
    "port": 8080
  },
  "debug": true
}

/exe @getServerUrl(cfg) = py {
server = cfg['server']
print(f"http://{server['host']}:{server['port']}")
}

/var @url = @getServerUrl(@config)
/show @url

## Test object field access in Python

/var @user = {
  "firstName": "Bob",
  "lastName": "Smith",
  "title": "Engineer"
}

/exe @formatUser(u) = py {
print(f"{u['firstName']} {u['lastName']} ({u['title']})")
}

/var @formatted = @formatUser(@user)
/show @formatted
