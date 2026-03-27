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

function maskIban(value: string): string {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  if (compact.length <= 8) {
    return maskIdentifier(compact);
  }
  return `${compact.slice(0, 3)}***${compact.slice(-5)}`;
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

function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex !== trimmed.lastIndexOf('@')) {
    return false;
  }
  const domain = trimmed.slice(atIndex + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && /^[+()\d.\-\s]+$/.test(trimmed);
}

function looksLikeIban(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact);
}

function looksLikeOpaqueIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 6 || /\s/.test(trimmed)) {
    return false;
  }
  if (looksLikeEmail(trimmed) || looksLikePhone(trimmed) || looksLikeIban(trimmed)) {
    return false;
  }
  return /[-_]/.test(trimmed) || /\d/.test(trimmed);
}

function looksLikeName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) {
    return false;
  }
  if (/[0-9@]/.test(trimmed)) {
    return false;
  }
  return /^[A-Za-z][A-Za-z .,'-]*$/.test(trimmed);
}

function isNameField(fieldName: string): boolean {
  return (
    fieldName === 'name' ||
    fieldName.endsWith('_name') ||
    fieldName.startsWith('name_')
  );
}

function isIdentifierField(fieldName: string): boolean {
  return (
    fieldName === 'id' ||
    fieldName.endsWith('_id') ||
    fieldName.includes('iban') ||
    fieldName.includes('account')
  );
}

function isParticipantField(fieldName: string): boolean {
  return (
    fieldName.includes('sender') ||
    fieldName.includes('recipient') ||
    fieldName.includes('receiver') ||
    fieldName.includes('payee') ||
    fieldName.includes('beneficiary') ||
    fieldName.includes('user') ||
    fieldName.includes('owner') ||
    fieldName.includes('author') ||
    fieldName.includes('contact')
  );
}

export function maskFactFieldValue(fieldName: string, rawValue: string): string {
  const normalizedField = fieldName.trim().toLowerCase();
  if (normalizedField.includes('email')) {
    return maskEmail(rawValue);
  }
  if (normalizedField.includes('phone') || normalizedField.includes('mobile')) {
    return maskPhone(rawValue);
  }
  if (isNameField(normalizedField)) {
    return maskName(rawValue);
  }
  if (isIdentifierField(normalizedField)) {
    return looksLikeIban(rawValue)
      ? maskIban(rawValue)
      : maskIdentifier(rawValue);
  }
  if (isParticipantField(normalizedField)) {
    if (looksLikeEmail(rawValue)) {
      return maskEmail(rawValue);
    }
    if (looksLikePhone(rawValue)) {
      return maskPhone(rawValue);
    }
    if (looksLikeIban(rawValue)) {
      return maskIban(rawValue);
    }
    if (looksLikeOpaqueIdentifier(rawValue)) {
      return maskIdentifier(rawValue);
    }
    if (looksLikeName(rawValue)) {
      return maskName(rawValue);
    }
  }
  if (looksLikeEmail(rawValue)) {
    return maskEmail(rawValue);
  }
  if (looksLikePhone(rawValue)) {
    return maskPhone(rawValue);
  }
  if (looksLikeIban(rawValue)) {
    return maskIban(rawValue);
  }
  if (looksLikeOpaqueIdentifier(rawValue)) {
    return maskIdentifier(rawValue);
  }
  return maskGenericString(rawValue);
}
