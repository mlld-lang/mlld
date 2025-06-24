/exe @getDate = {echo "2024-01-15"}
/exe @getUser = {echo "admin"}
/exe @getStatus = {echo "active"}

/var @systemInfo = {
date: run @getDate(),
user: run @getUser(),
status: run @getStatus(),
nested: {
backup_date: run @getDate(),
backup_user: run @getUser()
  }
}

/show [[System Information:
Date: {{systemInfo.date}}
User: {{systemInfo.user}}
Status: {{systemInfo.status}}

Backup Info:
Date: {{systemInfo.nested.backup_date}}
User: {{systemInfo.nested.backup_user}}]]