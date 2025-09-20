>> Access piped JSON data
/import { version, author } from @input
/show `Release @version by @author`

>> Access piped text (becomes 'content' field)
/import { content } from @input
/show `Received: @content`