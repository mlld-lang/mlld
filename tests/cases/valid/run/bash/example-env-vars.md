# Bash with Environment Variables

/text @home_msg = "Welcome home"
/data @user_data = { "role": "admin", "level": 5 }

/exec @showEnv(message, data) = bash {echo "Message: $message"}
echo "Data: $data"
echo "Bash is running"
}

/run @showEnv(@home_msg, @user_data)