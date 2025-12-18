>> Import specific variables
/import { API_KEY, NODE_ENV } from @input
/show `Deploying to @NODE_ENV with key @API_KEY`

>> Import and use in objects
/var @config = {
  "apiKey": @API_KEY,
  "environment": @NODE_ENV,
  "timestamp": @now
}