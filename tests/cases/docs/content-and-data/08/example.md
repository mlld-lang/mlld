/var @config = <settings.json>

>> Direct field access on parsed JSON
/show @config.json.apiUrl
/show @config.json.users[0].email

>> Raw content still available
/show @config.content                    >> Raw JSON string