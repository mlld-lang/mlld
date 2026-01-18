# Profiles Test

/profiles {
  full: {
    requires: { cmd: [echo], network, sh },
    description: "Full capabilities"
  },
  fallback: {
    requires: { cmd: [echo] },
    description: "Unused when full is granted"
  }
}

/show @mx.profile
