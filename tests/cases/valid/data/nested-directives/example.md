/var @config = {
server: {
host: "localhost",
port: 8080,
version: run {echo "v1.2.3"},
env: {
status: run {echo "ready"},
mode: run {echo "production"}
    }
  },
debug: true
}
/show [[Server running on {{config.server.host}}:{{config.server.port}}]]