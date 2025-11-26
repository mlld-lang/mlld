/var @features = {
  "darkMode": "false",
  "analytics": "true",
  "experimental": "false"
}

# Testing negation with || operator

/when (!@features.darkMode || !@features.experimental || @features.analytics) => show "At least one condition is true"
