/exe @getDate = cmd {echo "2024-01-15"}
/exe @getUser = cmd {echo "admin"}
/exe @getStatus = cmd {echo "active"}

/var @systemInfo = {
date: @getDate(),
user: @getUser(),
status: @getStatus(),
nested: {
backup_date: @getDate(),
backup_user: @getUser()
  }
}

/show :::System Information:
Date: {{systemInfo.date}}
User: {{systemInfo.user}}
Status: {{systemInfo.status}}

Backup Info:
Date: {{systemInfo.nested.backup_date}}
User: {{systemInfo.nested.backup_user}}:::