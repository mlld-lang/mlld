/var @config_path = "config/settings.json"
/var @config = "@config_path"
/show :::Config: {{config}}:::

/var @dynamic_path = "data/users.csv"
/var @data_file = "@dynamic_path"
/show :::Data file: {{data_file}}:::
