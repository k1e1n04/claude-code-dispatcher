import { GitHubIssue, DispatcherConfig } from '../types/index';
import { ResumableIssueProcessor } from './resumable-issue-processor';
import { IssueQueue } from './issue-queue';
import { RateLimitHandler } from './rate-limit-handler';
import { GitHubClient } from '../clients';
import { logger } from '../utils';

/**
 * Manages the issue processing loop and individual issue handling
 *
 * This class follows the Single Responsibility Principle by focusing solely on
 * processing management. It coordinates the processing loop, handles individual
 * issues, and delegates rate limit handling to the RateLimitHandler.
 *
 * @example
 * ```typescript
 * const manager = new ProcessingManager(processor, issueQueue, rateLimitHandler, githubClient, config);
 * manager.start();
 * ```
 *
 * @since 1.0.0
 */
export class ProcessingManager {
  private processingLoop: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private processor: ResumableIssueProcessor,
    private issueQueue: IssueQueue,
    private rateLimitHandler: RateLimitHandler,
    private githubClient: GitHubClient,
    private config: DispatcherConfig
  ) {}

  /**
   * Starts the processing loop
   *
   * The loop runs every 5 seconds and processes one issue at a time.
   * It only processes when the queue is not empty and not currently processing.
   *
   * @example
   * ```typescript
   * manager.start();
   * console.log('Processing loop started');
   * ```
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Processing manager is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting processing loop...');
    this.startProcessingLoop();
  }

  /**
   * Stops the processing loop
   *
   * Gracefully shuts down the processing loop and clears any pending timeouts.
   * Safe to call multiple times.
   *
   * @example
   * ```typescript
   * manager.stop();
   * console.log('Processing loop stopped');
   * ```
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping processing loop...');
    this.isRunning = false;

    if (this.processingLoop) {
      clearTimeout(this.processingLoop);
      this.processingLoop = null;
    }

    this.issueQueue.setProcessing(false);
    logger.info('Processing loop stopped');
  }

  /**
   * Processes a single GitHub issue through the complete workflow
   *
   * This method delegates to the ResumableIssueProcessor which handles:
   * 1. Branch creation
   * 2. Code generation via Claude Code
   * 3. Commit and push
   * 4. Pull request creation
   *
   * @param issue - The GitHub issue to process
   * @returns Promise that resolves to true if processing succeeded, false if rate limited
   *
   * @example
   * ```typescript
   * const success = await manager.processIssue(issue);
   * if (success) {
   *   console.log('Issue processed successfully');
   * } else {
   *   console.log('Issue processing was rate limited');
   * }
   * ```
   */
  async processIssue(issue: GitHubIssue): Promise<boolean> {
    this.issueQueue.setProcessing(true);

    try {
      logger.info(`Starting to process issue #${issue.number}: ${issue.title}`);

      const result = await this.processor.processIssue(
        issue,
        this.config.baseBranch
      );

      if (result.success && result.branchName) {
        logger.info(
          `Successfully created pull request for issue #${issue.number}`
        );
        return true; // Success - issue should be removed from queue
      } else if (result.shouldResume) {
        // Rate limit occurred, delegate to rate limit handler
        return await this.rateLimitHandler.handleRateLimit(issue, result);
      } else {
        logger.error(
          `Failed to process issue #${issue.number}: ${result.error}`
        );
        this.githubClient.markIssueAsProcessed(issue.id);
        return true; // Regular failure - issue should be removed from queue
      }
    } catch (error) {
      // ResumableIssueProcessor handles rate limits via result.shouldResume
      // Any thrown error here is unexpected
      logger.error(
        `Unexpected error processing issue #${issue.number}:`,
        error
      );
      this.githubClient.markIssueAsProcessed(issue.id);
      return true; // Unexpected error - issue should be removed from queue
    } finally {
      this.issueQueue.setProcessing(false);
    }
  }

  /**
   * Gets the current processing state
   *
   * @returns Current processing state
   *
   * @example
   * ```typescript
   * const running = manager.isProcessing();
   * console.log(`Processing manager running: ${running}`);
   * ```
   */
  isProcessing(): boolean {
    return this.isRunning;
  }

  /**
   * Starts the main processing loop that handles queued issues
   *
   * The loop runs every 5 seconds and processes one issue at a time.
   * It only processes when the queue is not empty and not currently processing.
   *
   * @private
   */
  private startProcessingLoop(): void {
    const processNext = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        if (!this.issueQueue.isEmpty() && !this.issueQueue.isProcessing()) {
          const issue = this.issueQueue.peek(); // Peek instead of dequeue

          if (issue) {
            const success = await this.processIssue(issue);

            // Only remove from queue if processing was successful
            if (success) {
              this.issueQueue.dequeue(); // Remove the issue we just processed
            }
            // If failed due to rate limit, issue stays in queue for retry
          }
        }
      } catch (error) {
        logger.error('Error in processing loop:', error);
      }

      if (this.isRunning) {
        this.processingLoop = setTimeout(processNext, 5000);
      }
    };

    processNext();
  }
}