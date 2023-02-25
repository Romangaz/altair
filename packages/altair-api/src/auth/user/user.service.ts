import { BASIC_PLAN_ID, User } from '@altairgraphql/db';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import { StripeService } from 'src/stripe/stripe.service';
import { ProviderInfo } from '../models/provider-info.dto';
import { SignupInput } from '../models/signup.input';
import { UpdateUserInput } from '../models/update-user.input';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService
  ) {}

  async createUser(
    payload: SignupInput,
    providerInfo?: ProviderInfo
  ): Promise<User> {
    // const hashedPassword = await this.passwordService.hashPassword(
    //   payload.password
    // );

    try {
      // Create stripe customer
      const stripeCustomer = await this.stripeService.connectOrCreateCustomer(
        payload.email
      );
      const user = await this.prisma.user.create({
        data: {
          ...payload,
          stripeCustomerId: stripeCustomer.id,
          // password: hashedPassword,
          Workspace: {
            create: {
              name: 'My workspace',
            },
          },
          ...(providerInfo
            ? {
                UserCredential: {
                  create: {
                    provider: providerInfo.provider,
                    providerUserId: providerInfo.providerUserId,
                  },
                },
              }
            : {}),
        },
      });

      return user;
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Email ${payload.email} already used.`);
      }
      throw new Error(e as any);
    }
  }

  getUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  getUserByStripeCustomerId(stripeCustomerId: string) {
    return this.prisma.user.findFirst({
      where: {
        stripeCustomerId,
      },
    });
  }

  updateUser(userId: string, newUserData: UpdateUserInput) {
    return this.prisma.user.update({
      data: newUserData,
      where: {
        id: userId,
      },
    });
  }

  async getPlanConfig(userId: string) {
    const res = await this.prisma.userPlan.findUnique({
      where: {
        userId,
      },
      include: {
        planConfig: true,
      },
    });

    if (!res) {
      this.logger.warn(
        `No plan config found for user (${userId}). Falling back to basic.`
      );

      return this.prisma.planConfig.findUnique({
        where: {
          id: BASIC_PLAN_ID,
        },
      });
    }

    const maxTeamMemberCount = Math.max(
      res.planConfig.maxTeamMemberCount,
      res.quantity
    );

    return {
      ...res.planConfig,
      maxTeamMemberCount,
    };
  }

  async updateAllowedTeamMemberCount(userId: string, quantity: number) {
    const user = await this.getUser(userId);
    // Check plan config
    const planConfig = await this.getPlanConfig(userId);
    // if allow additional team members
    if (!planConfig.allowMoreTeamMembers) {
      this.logger.warn(
        `Cannot update allowed team member count since allowMoreTeamMembers is not enabled for this plan config (${planConfig.id})`
      );
      return;
    }

    // update stripe subscription quantity
    await this.stripeService.updateSubscriptionQuantity(
      user.stripeCustomerId,
      quantity
    );

    // updte user plan with quantity
    await this.prisma.userPlan.update({
      where: {
        userId,
      },
      data: {
        quantity,
      },
    });
  }

  async getBillingUrl(userId: string, returnUrl?: string) {
    const user = await this.getUser(userId);
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const res = await this.stripeService.connectOrCreateCustomer(user.email);
      customerId = res.id;
    }

    const session = await this.stripeService.createBillingSession(
      user.stripeCustomerId,
      returnUrl
    );

    return session.url;
  }
}