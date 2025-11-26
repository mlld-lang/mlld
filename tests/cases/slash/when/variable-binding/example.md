/var @servers = ["web1", "web2", "db1"]

/var @hasWeb1 = "web1" in @servers
/var @hasWeb2 = "web2" in @servers
/var @hasWeb3 = "web3" in @servers

/when (@hasWeb1 || @hasWeb2 || @hasWeb3) => show "Found server: @hasWeb1"
