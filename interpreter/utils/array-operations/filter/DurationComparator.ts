import { TimeDurationNode } from '@core/types/primitives';

export class DurationComparator {
  compare(
    fieldValue: any,
    operator: string,
    duration: TimeDurationNode
  ): boolean {
    // Parse field as date
    const fieldDate = new Date(fieldValue);
    if (isNaN(fieldDate.getTime())) {
      console.warn(`Invalid date value for duration comparison: ${fieldValue}`);
      return false;
    }

    // Calculate age from now
    const now = new Date();
    const ageInMs = now.getTime() - fieldDate.getTime();
    const durationInMs = this.durationToMs(duration);

    // Compare age against duration
    // >7d means "older than 7 days" (age > duration)
    // <7d means "newer than 7 days" (age < duration)
    switch (operator) {
      case '>': return ageInMs > durationInMs;
      case '>=': return ageInMs >= durationInMs;
      case '<': return ageInMs < durationInMs;
      case '<=': return ageInMs <= durationInMs;
      case '==': return Math.abs(ageInMs - durationInMs) < 60000; // Within 1 minute
      case '!=': return Math.abs(ageInMs - durationInMs) >= 60000;
      default:
        console.warn(`Invalid operator for duration comparison: ${operator}`);
        return false;
    }
  }

  private durationToMs(duration: TimeDurationNode): number {
    const value = duration.value;
    switch (duration.unit) {
      case 'seconds': return value * 1000;
      case 'minutes': return value * 60 * 1000;
      case 'hours': return value * 60 * 60 * 1000;
      case 'days': return value * 24 * 60 * 60 * 1000;
      case 'weeks': return value * 7 * 24 * 60 * 60 * 1000;
      case 'years': return value * 365 * 24 * 60 * 60 * 1000;
      default:
        console.warn(`Unknown duration unit: ${duration.unit}`);
        return 0;
    }
  }
}