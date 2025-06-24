# Complex Test 3: Data Transformation Pipeline

/data @users = [
  { "id": 1, "name": "Alice", "role": "admin", "active": true },
  { "id": 2, "name": "Bob", "role": "user", "active": true },
  { "id": 3, "name": "Charlie", "role": "user", "active": false },
  { "id": 4, "name": "Diana", "role": "admin", "active": true }
]

/data @stats = {
  "total": 4,
  "admins": 2,
  "active": 3
}

# Complex exec commands for data processing
/exec @count_by_role(role) = {echo '@users' | jq '[.[] | select(.role == "@role")] | length']}
/exec @get_active_users = {echo '@users' | jq '[.[] | select(.active == true)] | length']}

# Test array access and data operations
/text @user_report = [[
# User Management Report

## Statistics
- Total Users: {{stats.total}}
- Admins: {{stats.admins}}
- Active Users: {{stats.active}}

## User List
1. {{users.0.name}} ({{users.0.role}}) - Active: {{users.0.active}}
2. {{users.1.name}} ({{users.1.role}}) - Active: {{users.1.active}}
3. {{users.2.name}} ({{users.2.role}}) - Active: {{users.2.active}}
4. {{users.3.name}} ({{users.3.role}}) - Active: {{users.3.active}}
]]

/text @role = run @count_by_role(admin)
/text @users = run @count_by_role(user)
/text @active = run @get_active_users

/text @user_counts = [[
## Computed Values
Admin Count: {{role}}
User Count: {{users}}
Active Users: {{active}}
]]

/add [[ 
{{user_report}}
{{user_counts}}
]]