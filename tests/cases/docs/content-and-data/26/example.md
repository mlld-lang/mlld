>> Process API data
/var @users = run {curl -s api.example.com/users}
/var @parsed = @users | @json

>> Define filter function for active users
/exe @filterActive(users) = js {
  return users.filter(u => u.status === "active")
}
/var @active = @filterActive(@parsed)

>> Generate report
/var @report = `# User Report

Active users: @active.length
Generated: @now

## Users
@active

`

/output @report to "user-report.md"