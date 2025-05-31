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
  / special:TTLSpecial { return { type: 'special', value: special }; }

// TTL Duration with units
TTLDuration "TTL duration"
  = num:Integer unit:TTLUnit {
      const seconds = helpers.ttlToSeconds(num, unit);
      return { value: num, unit, seconds };
    }

// TTL time units
TTLUnit "TTL time unit"
  = "s" { return "seconds"; }
  / "m" { return "minutes"; }
  / "h" { return "hours"; }
  / "d" { return "days"; }
  / "w" { return "weeks"; }

// TTL special values
TTLSpecial "TTL special value"
  = "live" { return "live"; }
  / "static" { return "static"; }

// Trust Option pattern (no angle brackets)
TrustOption "Trust level"
  = "trust" _ level:TrustLevel {
      return level;
    }

// Trust levels
TrustLevel "Trust level value"
  = "always" { return "always"; }
  / "verify" { return "verify"; }
  / "never" { return "never"; }

// Integer for TTL values
Integer "Integer"
  = digits:[0-9]+ {
      return parseInt(digits.join(''), 10);
    }