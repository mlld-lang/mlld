# Comprehensive Object Literals in Arrays Test

## Basic object in array
/var @basic = [{"name": "alice", "age": 30}]
/show @basic

## Multiple objects in array
/var @multiple = [{"name": "alice", "age": 30}, {"name": "bob", "age": 25}, {"name": "charlie", "age": 35}]
/show @multiple

## Mixed types in array
/var @mixed = [1, "text", {"key": "value"}, true, null, [5, 6]]
/show @mixed

## Nested objects in array
/var @nested = [{"user": {"name": "alice", "details": {"age": 30, "city": "NYC"}}}]
/show @nested

## Array of arrays with objects
/var @arrayOfArrays = [[{"id": 1}], [{"id": 2}, {"id": 3}], []]
/show @arrayOfArrays

## Object with array field
/var @objWithArray = [{"items": [1, 2, 3], "count": 3}]
/show @objWithArray

## Empty object in array
/var @empty = [{}]
/show @empty

## Complex nested structure
/var @complex = [
  {
    "type": "user",
    "data": {
      "profile": {"name": "alice", "roles": ["admin", "user"]},
      "settings": {"theme": "dark", "notifications": true}
    }
  },
  {
    "type": "system",
    "data": {
      "status": "active",
      "metrics": {"cpu": 45.2, "memory": 78.5}
    }
  }
]
/show @complex

## Variables in object values
/var @userName = "dynamic-user"
/var @userAge = 42
/var @withVars = [{"name": @userName, "age": @userAge, "active": true}]
/show @withVars

## Static values in object
/var @staticObj = [{"version": "1.0.0", "status": "stable"}]
/show @staticObj

## Path reference still works
/var @pathTest = [/etc/hosts]
/show `Path test (first 50 chars): @pathTest`