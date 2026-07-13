import { Injectable } from '@nestjs/common';

import { UserRepository } from '../../ports/auth/auth.repository.js';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class UserService {
  constructor(private readonly users: UserRepository) {}

  async getUserByEmail(email: string) {
    const user = await this.users.findUserByEmail(email);
    if (!user) {
      throw new BadRequestException(`User with email "${email}" not found`);
    }
    return user;
  }

  async getUserById(id: string) {
    const user = await this.users.findUserById(id);
    if (!user) {
      throw new BadRequestException(`User with id "${id}" not found`);
    }
    return user;
  }
}
