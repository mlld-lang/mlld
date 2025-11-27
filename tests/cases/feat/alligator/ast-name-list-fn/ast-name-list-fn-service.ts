export const API_VERSION = '1.0.0';

export interface Config {}

export class Service {
  process() {}
}

export function createUser() {
  return 'create';
}

export function updateUser() {
  return 'update';
}

export function deleteUser() {
  return 'delete';
}

export enum Role {
  Admin
}
