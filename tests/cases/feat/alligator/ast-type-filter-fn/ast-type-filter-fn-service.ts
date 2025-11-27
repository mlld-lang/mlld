export const API_VERSION = '1.0.0';

export interface User {
  id: string;
  name: string;
}

export class UserService {
  create() {
    return 'created';
  }
}

export function createUser() {
  return 'user';
}

export function updateUser() {
  return 'updated';
}

export function deleteUser() {
  return 'deleted';
}

export enum Status {
  Active,
  Inactive
}
