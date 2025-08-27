/var @access = @score > 80 && @verified ? "granted" : "denied"
/var @status = @isAdmin || (@isMod && @active) ? "privileged" : "standard"