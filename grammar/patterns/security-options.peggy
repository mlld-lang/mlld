// SECURITY OPTIONS PATTERNS
// Reusable patterns for TTL and Trust options across directives
// Used by: import, path, text, add, run, exec directives

// Main SecurityOptions pattern - used by all directives
SecurityOptions "Security options (TTL and/or Trust)"
  = ttl:TTLOption trust:(_ t:TrustOption { return t; })? {
      return {
        ...(ttl ? { ttl } : {}),
        ...(trust ? { trust } : {})
      };
    }
  / trust:TrustOption {
      return { trust };
    }

// TTL Option pattern
TTLOption "TTL cache duration"
  = "(" _ value:TTLValue _ ")" {
      return value;
    }

// TTL Value types
TTLValue "TTL value"
  = duration:TTLDuration { return { type: 'duration', ...duration }; }
  / special:TTLSpecial { 
      const specialValue = special.value || special; // Handle both old string and new object format
      return { 
        type: 'special', 
        value: specialValue,
        location: special.location || location()
      }; 
    }

// TTL Duration with units
TTLDuration "TTL duration"
  = num:Integer unit:TTLUnit {
      const unitValue = unit.unit || unit; // Handle both old string and new object format
      const seconds = helpers.ttlToSeconds(num, unitValue);
      return { 
        value: num, 
        unit: unitValue, 
        seconds,
        location: location()
      };
    }

// TTL time units
TTLUnit "TTL time unit"
  = unit:("s" / "m" / "h" / "d" / "w") {
      const unitMap = {
        "s": "seconds",
        "m": "minutes",
        "h": "hours",
        "d": "days",
        "w": "weeks"
      };
      return {
        unit: unitMap[unit],
        location: location()
      };
    }

// TTL special values
TTLSpecial "TTL special value"
  = value:("live" / "static") {
      return {
        value: value,
        location: location()
      };
    }

// Trust Option pattern (no angle brackets)
TrustOption "Trust level"
  = "trust" _ level:TrustLevel {
      // Handle both old string and new object format
      return level.level || level;
    }

// Trust levels
TrustLevel "Trust level value"
  = level:("always" / "verify" / "never") {
      return {
        level: level,
        location: location()
      };
    }

// Integer for TTL values
Integer "Integer"
  = digits:[0-9]+ {
      return parseInt(digits.join(''), 10);
    }