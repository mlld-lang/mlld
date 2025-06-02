# Basic Dependency Test

@exec process_data(file) = @run [node process.js @file] with {
  needs: {
    "node": {
      "lodash": "^4.17.0",
      "axios": ">=1.0.0"
    }
  }
}

# This would check dependencies before running
@run @process_data("data.json")