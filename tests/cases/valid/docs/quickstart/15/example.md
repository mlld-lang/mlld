/var @report = `System Status: All systems operational at @now`
/output @report to "status.txt"

/var @data = {"timestamp": "@now", "status": "ok"}
/output @data to "status.json" as json