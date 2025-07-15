/var @config_path = "./config/settings.json"
/path @config = [@config_path]
/show :::Config: {{config}}:::

/var @dynamic_path = "./data/users.csv"
/path @data_file = [@dynamic_path]
/show :::Data file: {{data_file}}:::