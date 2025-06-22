/text @config_path = "./config/settings.json"
/path @config = [@config_path]
/add [[Config: {{config}}]]

/text @dynamic_path = "./data/users.csv"
/path @data_file = [@dynamic_path]
/add [[Data file: {{data_file}}]]