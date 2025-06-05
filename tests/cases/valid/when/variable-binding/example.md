@data servers = ["web1", "web2", "db1"]

@when server any:
  "web1" in @servers
  "web2" in @servers
  "web3" in @servers
=>
  @add "Found server: {{server}}"
EOF < /dev/null