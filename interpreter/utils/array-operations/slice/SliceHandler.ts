export class SliceHandler {
  perform(items: any[], start?: number | null, end?: number | null): any[] {
    const len = items.length;

    // Handle negative indices and null values
    const actualStart = this.normalizeIndex(start, len, 0);
    const actualEnd = this.normalizeIndex(end, len, len);

    // Ensure valid range
    if (actualStart >= actualEnd) {
      return [];
    }

    // Slice preserves object references (including LoadContentResult)
    return items.slice(actualStart, actualEnd);
  }

  private normalizeIndex(
    index: number | null | undefined,
    length: number,
    defaultValue: number
  ): number {
    if (index === null || index === undefined) {
      return defaultValue;
    }

    if (index < 0) {
      // Negative index: count from end
      return Math.max(0, length + index);
    }

    // Positive index: clamp to array bounds
    return Math.min(index, length);
  }
}