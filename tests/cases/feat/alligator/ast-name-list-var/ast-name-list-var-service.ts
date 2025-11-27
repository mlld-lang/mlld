export const API_VERSION = '1.0.0';
export const MAX_RETRIES = 3;
export const DEFAULT_TIMEOUT = 5000;

export let currentUser = 'anonymous';

export function getVersion() {
  return API_VERSION;
}

export interface Config {}

export class Service {}
