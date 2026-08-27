import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type Role = 'owner' | 'provider' | 'admin';

/**
 * Account — one identity, potentially several roles (Domain Model
 * follow-up: "una cuenta, varios roles", matching the original design's
 * owner/provider mode toggle). `roles` starts with whatever the account
 * signed up as; POST /v1/auth/roles appends more later.
 */
@Entity({ name: 'accounts', schema: 'identity' })
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  @Column({ type: 'jsonb' })
  roles!: Role[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  hasRole(role: Role): boolean {
    return this.roles.includes(role);
  }

  addRole(role: Role): void {
    if (!this.roles.includes(role)) this.roles = [...this.roles, role];
  }
}
