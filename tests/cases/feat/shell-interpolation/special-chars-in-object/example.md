# Test: Special Characters in Object Values

>> Tests that special shell characters in object values are properly escaped

/var @config = {"path": "/usr/local/bin", "command": "echo $HOME", "quote": "it's"}
/run { echo @config }
