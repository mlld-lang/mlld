export const VERSION = '1.0.0';

export interface IUser {
  id: string;
}

export class UserService {
  create() {}
}

export function createUser() {
  return 'user';
}

export enum Status {
  Active
}

export type UserId = string;
