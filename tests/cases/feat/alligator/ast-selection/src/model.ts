export interface User {
  id: string;
  name: string;
}

export type UserId = string;

export enum Role {
  Admin = 'admin',
  User = 'user'
}
