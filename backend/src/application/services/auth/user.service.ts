import { Injectable } from '@nestjs/common';

import { BillingRuleException } from '../../../domain/exceptions/index.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';

@Injectable()
export class UserService {
  constructor(private readonly users: UserRepository) {}

  async getUserByEmail(email: string) {
    const user = await this.users.findUserByEmail(email);
    if (!user) {
      throw new BillingRuleException(`User with email "${email}" not found`);
    }
    return user;
  }

  async getUserById(id: string) {
    const user = await this.users.findUserById(id);
    if (!user) {
      throw new BillingRuleException(`User with id "${id}" not found`);
    }
    return user;
  }
}
