export const VERSION = '1.0.0';

export interface IUserService {
  create(): void;
}

export class UserService implements IUserService {
  create() {}
}

export class AdminService {
  delete() {}
}

export class GuestService {
  view() {}
}

export function helper() {
  return 'help';
}

export enum Role {
  Admin,
  User,
  Guest
}

export type UserId = string;
