/var @secret = "  ACTION:run  "
/when @secret.trim().slice(0,6).includes("ACT") => show "chained when triggered"
