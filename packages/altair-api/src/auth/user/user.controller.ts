import { IPlan } from '@altairgraphql/api-utils';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { QueriesService } from 'src/queries/queries.service';
import { QueryCollectionsService } from 'src/query-collections/query-collections.service';
import { TeamsService } from 'src/teams/teams.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(
    private userService: UserService,
    private queryService: QueriesService,
    private collectionService: QueryCollectionsService,
    private teamService: TeamsService
  ) {}

  @Get('billing')
  @UseGuards(JwtAuthGuard)
  async getBillingUrl(@Req() req: Request) {
    const userId = req?.user?.id ?? '';
    return {
      url: await this.userService.getBillingUrl(userId, req.headers.referer),
    };
  }

  @Get('plan')
  @UseGuards(JwtAuthGuard)
  async getCurrentPlan(@Req() req: Request): Promise<IPlan> {
    const userId = req?.user?.id ?? '';
    const cfg = await this.userService.getPlanConfig(userId);

    return {
      max_query_count: cfg?.maxQueryCount ?? 0,
      max_team_count: cfg?.maxTeamCount ?? 0,
      max_team_member_count: cfg?.maxTeamMemberCount ?? 0,
    };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@Req() req: Request) {
    const userId = req?.user?.id ?? '';

    return {
      queries: {
        own: await this.queryService.count(userId, true),
        access: await this.queryService.count(userId, false),
      },
      collections: {
        own: await this.collectionService.count(userId, true),
        access: await this.collectionService.count(userId, false),
      },
      teams: {
        own: await this.teamService.count(userId, true),
        access: await this.teamService.count(userId, false),
      },
    };
  }
}
