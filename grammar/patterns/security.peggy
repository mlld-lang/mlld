// SECURITY PATTERNS
// Shared parsing helpers for security labels applied to directives.

DataLabelList
  = list:DataLabelSequence {
      const raw = text();
      const deduped = [];
      const seen = new Set();

      for (const item of list) {
        if (!seen.has(item.label)) {
          seen.add(item.label);
          deduped.push(item.label);
        }
      }

      return {
        labels: deduped,
        raw: raw.trim()
      };
    }

DataLabelSequence
  = first:DataLabelToken rest:(_ "," _ DataLabelToken)* {
      const tokens = [first];
      for (const entry of rest) {
        tokens.push(entry[3]);
      }
      return tokens;
    }

DataLabelToken
  = label:DataLabelIdentifier {
      return { label };
    }

DataLabelIdentifier
  = label:BaseIdentifier &{
      const reserved = ['module', 'static', 'live', 'cached', 'local', 'foreach', 'pipeline', 'with', 'from', 'as'];
      return !reserved.includes(label.toLowerCase());
    } { return label; }
