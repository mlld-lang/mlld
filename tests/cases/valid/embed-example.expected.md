# Data variables example

# Data Variables Test

This test demonstrates the usage of various variable types in Meld.

@text grade = "B"
@data students = [
  { "name": "Alice", "score": 92, "grade": "A" },
  { "name": "Bob", "score": 78, "grade": "C" },
  { "name": "Charlie", "score": 85, "grade": "B" },
  { "name": "Diana", "score": 65, "grade": "D" }
]

## Student Information

Current grade: {{grade}}

Students:
- {{students.0.name}}: {{students.0.score}} ({{students.0.grade}})
- {{students.1.name}}: {{students.1.score}} ({{students.1.grade}})
- {{students.2.name}}: {{students.2.score}} ({{students.2.grade}})
- {{students.3.name}}: {{students.3.score}} ({{students.3.grade}}) 

# Circular import error

# Circular Import Test

This file is circular-import.error.mld.
It imports circular-import-b.error.mld, which then imports this file back,
creating a circular dependency that should be detected and rejected.

@text message = "This is file A"

@import [circular-import-b.error.mld]

The message from file B: {{message_b}} 