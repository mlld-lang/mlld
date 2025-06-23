/var @user = {"name": "Alice", "age": 30}
/show @user.name
/show @user.age

/var @nested = {
  "company": {
    "name": "TechCorp",
    "employees": 150
  }
}
/show @nested.company.name
/show @nested.company.employees