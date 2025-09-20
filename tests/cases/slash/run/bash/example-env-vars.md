# Bash with Environment Variables

/var @home_msg = "Welcome home"
/var @user_data = { "role": "admin", "level": 5 }

/exe @showEnv(message, data) = bash {
echo "Message: $message"
echo "Data: $data"
echo "Bash is running"
}

/run @showEnv(@home_msg, @user_data)