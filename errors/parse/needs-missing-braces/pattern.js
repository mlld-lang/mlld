export const pattern = {
  name: 'needs-missing-braces',

  test(error, mx) {
    // Check for /needs with multiple capabilities without braces
    // Examples: "needs sh, network" or "needs sh network"
    if (!mx.line) return false;

    const line = mx.line.trim();

    // Must start with /needs or needs
    if (!line.match(/^\/?needs\s+/i)) return false;

    // Should NOT have braces already
    if (line.includes('{')) return false;

    // Should have multiple capabilities (comma-separated or space-separated)
    // Common capabilities: sh, bash, network, net, filesystem, fs, keychain
    const afterNeeds = line.replace(/^\/?needs\s+/, '');
    const capabilities = ['sh', 'bash', 'network', 'net', 'filesystem', 'fs', 'keychain', 'cmd'];

    // Check for comma-separated capabilities
    if (afterNeeds.includes(',')) {
      const parts = afterNeeds.split(',').map(p => p.trim().toLowerCase());
      const matchCount = parts.filter(p => capabilities.includes(p)).length;
      return matchCount >= 2;
    }

    // Check for space-separated capabilities
    const parts = afterNeeds.split(/\s+/).map(p => p.trim().toLowerCase());
    const matchCount = parts.filter(p => capabilities.includes(p)).length;
    return matchCount >= 2;
  },

  enhance(error, mx) {
    const line = mx.line.trim();
    const afterNeeds = line.replace(/^\/?needs\s+/, '');

    // Extract capabilities
    let capabilities;
    if (afterNeeds.includes(',')) {
      capabilities = afterNeeds.split(',').map(p => p.trim());
    } else {
      capabilities = afterNeeds.split(/\s+/).map(p => p.trim());
    }

    // Filter to known capabilities only
    const knownCaps = ['sh', 'bash', 'network', 'net', 'filesystem', 'fs', 'keychain', 'cmd'];
    const validCaps = capabilities.filter(c => knownCaps.includes(c.toLowerCase()));

    return {
      ORIGINAL: line,
      SUGGESTED: `/needs { ${validCaps.join(', ')} }`
    };
  }
};
