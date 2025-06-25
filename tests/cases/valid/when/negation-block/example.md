/var @features = {
  "darkMode": "false",
  "analytics": "true",
  "experimental": "false"
}

# Testing negation in block form

/when any: [
  !@features.darkMode
  !@features.experimental  
  @features.analytics
] => show "At least one condition is true"