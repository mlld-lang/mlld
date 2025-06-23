/var @users = [
  {name: "Alice", role: {title: "Admin", level: 5}},
  {name: "Bob", role: {title: "User", level: 1}}
]
/var @permissions = {
adminName: @users[0].name,
adminLevel: @users[0].role.level,
userCount: 2
}
/show [[{{permissions.adminName}} has level {{permissions.adminLevel}} access]]