# Import specific fields from payload
/import { @text, @userId } from @payload

# Import specific fields from state
/import { @count, @messages } from @state

# Use the imported variables
/var @newCount = @count + 1
/var @history = @messages
/show "User @userId said: @text"