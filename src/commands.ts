import type { Logger, Router } from '@fraqjs/fraq';

import { registerActionCommands } from './commands/actions.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerQueryCommands } from './commands/queries.js';
import { registerSubscriptionCommands } from './commands/subscriptions.js';
import type { GitHubEventService } from './services/index.js';

export function registerCommands(router: Router, service: GitHubEventService, logger: Logger): void {
  registerAuthCommands(router, service, logger);
  registerSubscriptionCommands(router, service, logger);
  registerQueryCommands(router, service, logger);
  registerActionCommands(router, service, logger);
  router.command('help').execute(async (session) => {
    await session.reply(
      [
        'GitHub 功能：',
        'auth / install / bind / subscribe / subscriptions',
        'search / contribution / repo / view / link / readme / license',
        'release / deployments / content / diff',
        'star / unstar / comment / label / unlabel',
        'close / reopen / approve / merge / squash / rebase',
        '详细参数请查看项目 README。',
      ].join('\n'),
    );
  });
}
