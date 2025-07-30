/exe @getDate = {echo "2024-01-15"}
/exe @getUser = {echo "admin"}
/exe @getStatus = {echo "active"}

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