// Spread pattern abstraction

SpreadPattern "spread pattern"
  = "..." { helpers.debug('Spread prefix'); } _ source:AtVar {
      helpers.debug('SpreadPattern matched', { source });
      return {
        type: 'spread',
        source,
        location: location()
      };
    }
