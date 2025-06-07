@data user = {"name": "Alice", "age": 30}
@add @user.name
@add @user.age

@data nested = {
  "company": {
    "name": "TechCorp",
    "employees": 150
  }
}
@add @nested.company.name
@add @nested.company.employees