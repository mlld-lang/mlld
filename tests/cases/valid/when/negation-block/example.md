@data features = {
  "darkMode": false,
  "analytics": true,
  "experimental": false
}

# Testing negation in block form

@when @features any: [
  !@features.darkMode
  !@features.experimental  
  @features.analytics
] => @add "At least one condition is true"