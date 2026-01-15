// NEEDS AND WANTS DIRECTIVES
// Implements /needs and /wants parsing with structured capability objects

NeedsKeyword
  = "/"? "needs"

WantsKeyword
  = "/"? "wants"

SlashNeeds
  = DirectiveContext NeedsKeyword _ object:NeedsObject ending:StandardDirectiveEnding? {
      const packageKeys = ['node', 'js', 'python', 'py', 'ruby', 'rb', 'go', 'rust'];
      const meta = {
        hasCmd: Boolean(object.cmd),
        hasPackages: packageKeys.some(key => Array.isArray(object[key]) && object[key].length > 0),
        hasNetwork: object.network === true || object.net === true,
        hasShell: object.sh === true || object.bash === true,
        bareCommands: Array.isArray(object.__commands) ? object.__commands.length : 0,
        ...(ending?.comment ? { comment: ending.comment } : {})
      };

      return helpers.createStructuredDirective(
        DirectiveKind.needs,
        'needs',
        { needs: object },
        { needs: object },
        meta,
        location(),
        'needs'
      );
    }

SlashWants
  = DirectiveContext WantsKeyword _ tiers:WantsArray ending:StandardDirectiveEnding? {
      const meta = {
        tierCount: tiers.length,
        ...(ending?.comment ? { comment: ending.comment } : {})
      };

      return helpers.createStructuredDirective(
        DirectiveKind.wants,
        'wants',
        { wants: tiers },
        { wants: tiers },
        meta,
        location(),
        'wants'
      );
    }

// -------------------------------------------------------------
// NEEDS SUPPORT
// -------------------------------------------------------------

NeedsObject
  = "{" _ entries:NeedsEntryList? _ "}" {
      const result = {};
      if (entries) {
        for (const [key, value] of entries) {
          if (key === '__commands') {
            const bucket = (result.__commands || (result.__commands = []));
            bucket.push(value);
            continue;
          }
          if (result[key] === undefined) {
            result[key] = value;
          } else if (Array.isArray(result[key]) && Array.isArray(value)) {
            result[key] = result[key].concat(value);
          } else {
            result[key] = value;
          }
        }
      }
      return result;
    }

NeedsEntryList
  = first:NeedsEntry rest:(CommaSpace entry:NeedsEntry { return entry; })* {
      return [first, ...rest];
    }

NeedsEntry
  = "cmd" _ ":" _ value:NeedsCommandValue {
      return ['cmd', value];
    }
  / pkg:NeedsPackageKey _ ":" _ value:NeedsPackageList {
      return [pkg, value];
    }
  / key:NeedsBooleanKey bool:NeedsBooleanOption? {
      return [key, bool ?? true];
    }
  / name:CapabilityName {
      return ['__commands', name];
    }

NeedsBooleanOption
  = _ ":" _ bool:BooleanLiteral { return bool === 'true' || bool === true; }

NeedsCommandValue
  = "*" { return { type: 'wildcard' }; }
  / "[" _ items:NeedsValueList? _ "]" {
      return { type: 'list', items: items || [] };
    }
  / "{" _ entries:NeedsCommandEntries? _ "}" {
      const result = {};
      if (entries) {
        for (const [key, value] of entries) {
          result[key] = value;
        }
      }
      return { type: 'map', entries: result };
    }

NeedsCommandEntries
  = first:NeedsCommandEntry rest:(CommaSpace entry:NeedsCommandEntry { return entry; })* {
      return [first, ...rest];
    }

NeedsCommandEntry
  = name:CapabilityName _ ":" _ value:NeedsCommandDetail {
      return [name, value];
    }

NeedsCommandDetail
  = "*" { return { type: 'wildcard' }; }
  / "[" _ items:NeedsValueList? _ "]" { return { type: 'list', items: items || [] }; }
  / "{" _ props:NeedsCommandDetailProps? _ "}" {
      const result = {};
      if (props) {
        for (const [key, value] of props) {
          result[key] = value;
        }
      }
      return { type: 'detail', props: result };
    }

NeedsCommandDetailProps
  = first:NeedsCommandDetailProp rest:(CommaSpace entry:NeedsCommandDetailProp { return entry; })* {
      return [first, ...rest];
    }

NeedsCommandDetailProp
  = "methods" _ ":" _ items:NeedsValueArray { return ['methods', items]; }
  / "subcommands" _ ":" _ items:NeedsValueArray { return ['subcommands', items]; }
  / "flags" _ ":" _ items:NeedsValueArray { return ['flags', items]; }

NeedsValueArray
  = "[" _ items:NeedsValueList? _ "]" { return items || []; }

NeedsValueList
  = first:NeedsValueToken rest:(CommaSpace token:NeedsValueToken { return token; })* {
      return [first, ...rest];
    }

NeedsValueToken
  = token:DataString { return token; }
  / token:BaseIdentifier { return token; }

NeedsPackageList
  = "[" _ pkgs:NeedsPackageItems? _ "]" {
      return pkgs || [];
    }

NeedsPackageItems
  = first:NeedsPackageToken rest:(CommaSpace token:NeedsPackageToken { return token; })* {
      return [first, ...rest];
    }

NeedsPackageToken
  = value:DataString { return value; }
  / value:$([a-zA-Z0-9@._+\-^=~><!]+) { return value; }

NeedsPackageKey
  = "node"
  / "js"
  / "python"
  / "py"
  / "ruby"
  / "rb"
  / "go"
  / "rust"

NeedsBooleanKey
  = "sh"
  / "bash"
  / "network"
  / "net"
  / "filesystem"
  / "fs"
  / "keychain"

CapabilityName
  = name:DataString { return name; }
  / name:BaseIdentifier &{
      const lowered = String(name).toLowerCase();
      return !['cmd', 'node', 'js', 'python', 'py', 'ruby', 'rb', 'go', 'rust', 'sh', 'bash', 'network', 'net', 'filesystem', 'fs', 'keychain', 'tier', 'why'].includes(lowered);
    } { return name; }

// -------------------------------------------------------------
// WANTS SUPPORT
// -------------------------------------------------------------

WantsArray
  = "[" _ tiers:WantsTierList? _ "]" {
      return tiers || [];
    }

WantsTierList
  = first:WantsTierObject rest:(CommaSpace tier:WantsTierObject { return tier; })* {
      return [first, ...rest];
    }

WantsTierObject
  = "{" _ entries:WantsProperties? _ "}" {
      const result = {};
      if (entries) {
        for (const [key, value] of entries) {
          if (key === '__commands') {
            const bucket = (result.__commands || (result.__commands = []));
            bucket.push(value);
            continue;
          }
          result[key] = value;
        }
      }
      return result;
    }

WantsProperties
  = first:WantsProperty rest:(CommaSpace prop:WantsProperty { return prop; })* {
      return [first, ...rest];
    }

WantsProperty
  = "tier" _ ":" _ value:DataString { return ['tier', value]; }
  / "why" _ ":" _ value:DataString { return ['why', value]; }
  / prop:NeedsEntry { return prop; }
