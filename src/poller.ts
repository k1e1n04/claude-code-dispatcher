import { GitHubClient } from './github-client';
import { IssueQueue } from './issue-queue';
import { DispatcherConfig } from './types';
import { logger } from './logger';
import { RetryHandler } from './logger';

export class IssuePoller {
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private githubClient: GitHubClient,
    private issueQueue: IssueQueue,
    private config: DispatcherConfig
  ) {}

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Poller is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting poller with interval ${this.config.pollInterval}s`);
    
    await this.pollOnce();
    
    this.pollTimer = setInterval(async () => {
      await this.pollOnce();
    }, this.config.pollInterval * 1000);
  }

  stop(): void {
    if (!this.isRunning) {
      logger.warn('Poller is not running');
      return;
    }

    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    
    logger.info('Poller stopped');
  }

  private async pollOnce(): Promise<void> {
    try {
      logger.info('Polling for new issues...');
      
      await this.githubClient.checkRateLimit();
      
      const issues = await RetryHandler.withRetry(
        () => this.githubClient.getAssignedIssues(
          this.config.owner,
          this.config.repo,
          this.config.assignee
        ),
        this.config.maxRetries,
        1000,
        'GitHub API call'
      );

      if (issues.length > 0) {
        this.issueQueue.enqueue(issues);
        logger.info(`Added ${issues.length} new issues to queue`);
      } else {
        logger.info('No new issues found');
      }
    } catch (error) {
      logger.error('Polling failed:', error);
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getStatus(): { 
    running: boolean; 
    nextPollIn?: number;
    queueStatus: ReturnType<IssueQueue['getStatus']>;
  } {
    return {
      running: this.isRunning,
      nextPollIn: this.isRunning ? this.config.pollInterval : undefined,
      queueStatus: this.issueQueue.getStatus()
    };
  }
}