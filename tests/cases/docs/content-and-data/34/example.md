>> .att files (default for 5+ lines)
>> file: templates/deploy.att
# Deployment: @env
Status: @status
Config: <@base/config/@env.json>

>> usage
/exe @deploy(env, status) = template "./templates/deploy.att"
/show @deploy("prod", "success")

>> .mtt files (Discord/social only)
>> file: templates/discord.mtt
🚨 Alert <@{{adminId}}>!
Reporter: <@{{reporterId}}>
Severity: {{severity}}

>> usage
/exe @alert(adminId, reporterId, severity) = template "./templates/discord.mtt"