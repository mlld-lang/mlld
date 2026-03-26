function maskEmail(value: string): string {
  const trimmed = value.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) {
    return '[email]';
  }
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const localPreview = `${local[0] ?? ''}${local.length > 1 ? '***' : '*'}`;
  return `${localPreview}@${domain}`;
}

function maskIdentifier(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return `${trimmed[0] ?? ''}***`;
  }
  const prefix = trimmed.slice(0, Math.min(4, Math.max(1, trimmed.length - 4)));
  const suffix = trimmed.slice(-4);
  return `${prefix}…${suffix}`;
}

function maskName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '[name]';
  }
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map(part => `${part[0] ?? ''}${part.length > 1 ? '*'.repeat(Math.max(1, part.length - 1)) : ''}`)
    .join(' ');
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) {
    return '[phone]';
  }
  const suffix = digits.slice(-2);
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)}` : '+*';
  return `${country}-***-**${suffix}`;
}

function maskGenericString(_value: string): string {
  return '[string value]';
}

export function maskFactFieldValue(fieldName: string, rawValue: string): string {
  const normalizedField = fieldName.trim().toLowerCase();
  if (normalizedField.includes('email')) {
    return maskEmail(rawValue);
  }
  if (normalizedField.includes('phone') || normalizedField.includes('mobile')) {
    return maskPhone(rawValue);
  }
  if (
    normalizedField === 'name' ||
    normalizedField.endsWith('_name') ||
    normalizedField.startsWith('name_')
  ) {
    return maskName(rawValue);
  }
  if (
    normalizedField === 'id' ||
    normalizedField.endsWith('_id') ||
    normalizedField.includes('iban') ||
    normalizedField.includes('account')
  ) {
    return maskIdentifier(rawValue);
  }
  return maskGenericString(rawValue);
}
