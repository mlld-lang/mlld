/exe @userCard(user) = ::
**@user.name**
Role: @user.role
Status: @user.active
::

/var @alice = {"name": "Alice", "role": "Developer", "active": true}
/show @userCard(@alice)