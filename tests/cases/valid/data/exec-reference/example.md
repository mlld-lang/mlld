@exec getDate = @run [(echo "2024-01-15")]
@exec getUser = @run [(echo "admin")]
@exec getStatus = @run [(echo "active")]

@data systemInfo = {
  date: @run @getDate,
  user: @run @getUser,
  status: @run @getStatus,
  nested: {
    backup_date: @run @getDate,
    backup_user: @run @getUser
  }
}

@add [[System Information:
Date: {{systemInfo.date}}
User: {{systemInfo.user}}
Status: {{systemInfo.status}}

Backup Info:
Date: {{systemInfo.nested.backup_date}}
User: {{systemInfo.nested.backup_user}}]]