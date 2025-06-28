# Comprehensive Object Literals in Arrays Test

## Basic object in array

[
  {
    "name": "alice",
    "age": 30
  }
]
## Multiple objects in array

[
  {
    "name": "alice",
    "age": 30
  },
  {
    "name": "bob",
    "age": 25
  },
  {
    "name": "charlie",
    "age": 35
  }
]
## Mixed types in array

[
  1,
  "text",
  {
    "key": "value"
  },
  true,
  null,
  [
    5,
    6
  ]
]
## Nested objects in array

[
  {
    "user": {
      "name": "alice",
      "details": {
        "age": 30,
        "city": "NYC"
      }
    }
  }
]
## Array of arrays with objects

[
  [
    {
      "id": 1
    }
  ],
  [
    {
      "id": 2
    },
    {
      "id": 3
    }
  ],
  []
]
## Object with array field

[
  {
    "items": [
      1,
      2,
      3
    ],
    "count": 3
  }
]
## Empty object in array

[
  {}
]
## Complex nested structure

[
  {
    "type": "user",
    "data": {
      "profile": {
        "name": "alice",
        "roles": [
          "admin",
          "user"
        ]
      },
      "settings": {
        "theme": "dark",
        "notifications": true
      }
    }
  },
  {
    "type": "system",
    "data": {
      "status": "active",
      "metrics": {
        "cpu": 45.2,
        "memory": 78.5
      }
    }
  }
]
## Variables in object values

[
  {
    "name": "dynamic-user",
    "age": 42,
    "active": true
  }
]
## Static values in object

[
  {
    "version": "1.0.0",
    "status": "stable"
  }
]
## Path reference still works

Path test (first 50 chars): ##
# Host Database
#
# localhost is used to configure the loopback interface
# when the system is booting.  Do not change this entry.
##
127.0.0.1	localhost
255.255.255.255	broadcasthost
::1             localhost