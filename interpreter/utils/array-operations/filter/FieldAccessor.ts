export class FieldAccessor {
  get(item: any, field: string | string[]): any {
    if (typeof field === 'string') {
      return this.getSimpleField(item, field);
    }

    // Navigate nested path
    let current = item;
    for (const key of field) {
      if (current == null) {
        return undefined;
      }
      current = this.getSimpleField(current, key);
    }
    return current;
  }

  private getSimpleField(obj: any, field: string): any {
    if (obj == null) {
      return undefined;
    }

    // Direct property access works for both LoadContentResult and plain objects
    // LoadContentResult getters (like .fm, .filename) work automatically
    if (typeof obj === 'object') {
      return obj[field];
    }

    // Can't access fields on primitives
    return undefined;
  }
}