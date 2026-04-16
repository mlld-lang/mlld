import type { Environment } from './Environment';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  isEnvironmentTagged,
  markEnvironment
} from '@core/utils/environment-identity';

export { ENVIRONMENT_SERIALIZE_PLACEHOLDER, markEnvironment };

export function isEnvironment(value: unknown): value is Environment {
  return isEnvironmentTagged(value);
}
