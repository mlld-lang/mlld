/var @config = {
  "database": {
    "host": "localhost",
    "ports": [5432, 5433]
  },
  "features": ["auth", "api", "cache"]
}

/show @config.database.host           # "localhost"
/show @config.database.ports[0]        # 5432
/show @config.features[1]              # "api"