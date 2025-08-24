import { GitHubClient } from '../clients';
import { IssueQueue } from './issue-queue';
import { IssuePoller } from './poller';
import { IssueProcessor } from './issue-processor';
import { GitRepository } from '../infrastructure';
import { ClaudeCodeExecutor, RateLimitError } from '../clients';
import { PromptBuilder } from '../utils';
import { DispatcherConfig, GitHubIssue } from '../types';
import { logger } from '../utils';

/**
 * Central dispatcher for automating GitHub issue processing using Claude Code
 *
 * The ClaudeCodeDispatcher orchestrates the entire workflow from issue detection
 * to pull request creation. It uses a modular architecture with dependency injection
 * for better testability and maintainability.
 *
 * @example
 * ```typescript
 * const config = {
 *   owner: 'myorg',
 *   repo: 'myproject',
 *   assignee: 'developer',
 *   baseBranch: 'main',
 *   pollInterval: 60,
 *   maxRetries: 3,
 *   allowedTools: ['Edit', 'Write', 'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git push:*)', 'Bash(gh pr create:*)']
 * };
 *
 * const dispatcher = new ClaudeCodeDispatcher(config, '/project/path');
 * await dispatcher.start();
 * ```
 *
 * @since 1.0.0
 */
export class ClaudeCodeDispatcher {
  private githubClient: GitHubClient;
  private issueQueue: IssueQueue;
  private poller: IssuePoller;
  private processor: IssueProcessor;
  private isRunning = false;
  private processingLoop: NodeJS.Timeout | null = null;

  /**
   * Creates a new ClaudeCodeDispatcher instance
   *
   * Initializes all components including GitHub client, issue queue, poller, and processor
   * using the new modular architecture with dependency injection.
   *
   * @param config - Configuration options for the dispatcher
   * @param workingDirectory - Working directory for git operations (defaults to current working directory)
   *
   * @example
   * ```typescript
   * const config = {
   *   owner: 'myorg',
   *   repo: 'myproject',
   *   assignee: 'developer',
   *   baseBranch: 'main',
   *   pollInterval: 60,
   *   maxRetries: 3,
   *   allowedTools: ['Edit', 'Write']
   * };
   * const dispatcher = new ClaudeCodeDispatcher(config, '/project/path');
   * ```
   */
  constructor(private config: DispatcherConfig, workingDirectory?: string) {
    this.githubClient = new GitHubClient();
    this.issueQueue = new IssueQueue();
    this.poller = new IssuePoller(this.githubClient, this.issueQueue, config);

    // Create dependencies for the new modular architecture
    const gitRepository = new GitRepository(workingDirectory);
    const claudeExecutor = new ClaudeCodeExecutor({
      workingDirectory,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      dangerouslySkipPermissions: config.dangerouslySkipPermissions,
      rateLimitRetryDelay: config.rateLimitRetryDelay,
    });
    const promptBuilder = new PromptBuilder();

    this.processor = new IssueProcessor(
      gitRepository,
      claudeExecutor,
      promptBuilder
    );
  }

  /**
   * Starts the dispatcher and begins monitoring for GitHub issues
   *
   * This method:
   * 1. Validates prerequisites (GitHub CLI, Claude CLI, repository access)
   * 2. Starts the issue poller
   * 3. Begins the processing loop
   * 4. Sets up graceful shutdown handlers
   *
   * @throws {Error} When prerequisites validation fails or startup encounters an error
   *
   * @example
   * ```typescript
   * try {
   *   await dispatcher.start();
   *   console.log('Dispatcher started successfully');
   * } catch (error) {
   *   console.error('Failed to start dispatcher:', error);
   * }
   * ```
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Dispatcher is already running');
      return;
    }

    try {
      logger.info('Starting Claude Code Dispatcher...');

      await this.validatePrerequisites();

      this.isRunning = true;

      await this.poller.start();
      this.startProcessingLoop();

      logger.info('Claude Code Dispatcher started successfully');
      logger.info('Press Ctrl+C to stop the dispatcher');

      this.keepAlive();
    } catch (error) {
      logger.error('Failed to start dispatcher:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stops the dispatcher and cleans up resources
   *
   * This method gracefully shuts down:
   * - Issue polling
   * - Processing loops
   * - Background timers
   *
   * Safe to call multiple times - will only stop once.
   *
   * @example
   * ```typescript
   * // Graceful shutdown
   * process.on('SIGINT', async () => {
   *   await dispatcher.stop();
   *   process.exit(0);
   * });
   * ```
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Claude Code Dispatcher...');

    this.isRunning = false;

    this.poller.stop();

    if (this.processingLoop) {
      clearTimeout(this.processingLoop);
      this.processingLoop = null;
    }

    this.issueQueue.setProcessing(false);

    logger.info('Claude Code Dispatcher stopped');
  }

  /**
   * Validates that all required prerequisites are available
   *
   * Checks for:
   * - GitHub CLI authentication
   * - Repository access permissions
   * - Claude CLI availability
   *
   * @private
   * @throws {Error} When any prerequisite check fails
   */
  private async validatePrerequisites(): Promise<void> {
    try {
      const { execSync } = await import('child_process');

      logger.info('Validating prerequisites...');

      execSync('gh auth status', { stdio: 'pipe' });

      execSync(`gh repo view ${this.config.owner}/${this.config.repo}`, {
        stdio: 'pipe',
      });

      execSync('claude --version', { stdio: 'pipe' });

      logger.info('Prerequisites validation passed');
    } catch (error) {
      logger.error('Prerequisites validation failed:', error);
      throw new Error(
        'Prerequisites validation failed. Please ensure GitHub CLI and Claude CLI are installed and authenticated.'
      );
    }
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

  /**
   * Processes a single GitHub issue through the complete workflow
   *
   * This method delegates to the IssueProcessor which handles:
   * 1. Branch creation
   * 2. Code generation via Claude Code
   * 3. Commit and push
   * 4. Pull request creation
   *
   * @private
   * @param issue - The GitHub issue to process
   * @returns true if processing succeeded, false if rate limited
   */
  private async processIssue(issue: GitHubIssue): Promise<boolean> {
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
      } else {
        logger.error(
          `Failed to process issue #${issue.number}: ${result.error}`
        );
        this.githubClient.markIssueAsProcessed(issue.id);
        return true; // Regular failure - issue should be removed from queue
      }
    } catch (error) {
      // Check if it's a rate limit error
      if (error instanceof RateLimitError) {
        return await this.handleRateLimit(error, issue);
      }

      logger.error(
        `Unexpected error processing issue #${issue.number}:`,
        error
      );
      this.githubClient.markIssueAsProcessed(issue.id);
      return true; // Regular error - issue should be removed from queue
    } finally {
      this.issueQueue.setProcessing(false);
    }
  }

  /**
   * Handles rate limit errors by pausing and retrying
   * @private
   * @param error - The rate limit error
   * @param issue - The issue that was being processed
   * @returns false to indicate issue should stay in queue
   */
  private async handleRateLimit(
    _error: RateLimitError,
    issue: GitHubIssue
  ): Promise<boolean> {
    const rateLimitRetryDelay =
      this.config.rateLimitRetryDelay || 5 * 60 * 1000;
    logger.warn(
      `Claude Code rate limited. Pausing for ${
        rateLimitRetryDelay / 60000
      } minutes before retry...`
    );
    await new Promise((resolve) => setTimeout(resolve, rateLimitRetryDelay));

    logger.info(
      `Rate limit pause completed, will retry issue #${issue.number}...`
    );
    return false; // Issue should stay in queue for retry
  }

  /**
   * Keeps the dispatcher alive and logs periodic status updates
   *
   * Runs every 30 seconds to log current status including queue size,
   * processing state, and polling state.
   *
   * @private
   */
  private keepAlive(): void {
    const keepAliveInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(keepAliveInterval);
        return;
      }

      const status = this.getStatus();
      const processingStatus = status.processing ? 'Yes' : 'No';

      logger.info(
        `Status - Queue: ${
          status.queueSize
        }, Processing: ${processingStatus}, Polling: ${
          status.polling ? 'Yes' : 'No'
        }`
      );

      if (status.nextIssue && !status.processing && status.queueSize > 0) {
        logger.info(
          `Next issue in queue: #${status.nextIssue.number} - ${status.nextIssue.title}`
        );
      }
    }, 30000);
  }

  /**
   * Gets the current status of the dispatcher
   *
   * @returns Current status including polling state, processing state, queue size, and next issue
   *
   * @example
   * ```typescript
   * const status = dispatcher.getStatus();
   * console.log(`Queue size: ${status.queueSize}`);
   * console.log(`Polling: ${status.polling ? 'Active' : 'Inactive'}`);
   * console.log(`Processing: ${status.processing ? 'Active' : 'Inactive'}`);
   * if (status.nextIssue) {
   *   console.log(`Next issue: #${status.nextIssue.number} - ${status.nextIssue.title}`);
   * }
   * ```
   */
  getStatus(): {
    polling: boolean;
    processing: boolean;
    queueSize: number;
    nextIssue?: GitHubIssue;
  } {
    const pollerStatus = this.poller.getStatus();
    const queueStatus = this.issueQueue.getStatus();

    return {
      polling: pollerStatus.running,
      processing: queueStatus.processing,
      queueSize: queueStatus.queueSize,
      nextIssue: queueStatus.nextIssue,
    };
  }
}
