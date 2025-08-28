import { DispatcherConfig } from '../types/index';
import { GitHubClient } from '../clients';
import { ClaudeCodeExecutor } from '../clients';
import { GitRepository } from '../infrastructure';
import { PromptBuilder } from '../utils';
import { IssueQueue } from './issue-queue';
import { IssuePoller } from './poller';
import { ResumableIssueProcessor } from './resumable-issue-processor';
import { ProcessingStateManager } from './processing-state-manager';
import { PrerequisitesValidator } from './prerequisites-validator';
import { ProcessingManager } from './processing-manager';
import { RateLimitHandler } from './rate-limit-handler';
import { StatusMonitor } from './status-monitor';

/**
 * Container for managing service dependencies and their creation
 *
 * This class follows the Single Responsibility Principle and Dependency Injection
 * pattern by centralizing the creation and management of all service dependencies.
 * It provides factory methods for creating services with proper dependencies.
 *
 * @example
 * ```typescript
 * const container = new ServiceContainer(config, '/workspace');
 * const dispatcher = container.createDispatcher();
 * ```
 *
 * @since 1.0.0
 */
export class ServiceContainer {
  private readonly config: DispatcherConfig;
  private readonly workingDirectory?: string;
  
  // Lazy-initialized singletons
  private _githubClient?: GitHubClient;
  private _issueQueue?: IssueQueue;
  private _gitRepository?: GitRepository;
  private _claudeExecutor?: ClaudeCodeExecutor;
  private _promptBuilder?: PromptBuilder;
  private _stateManager?: ProcessingStateManager;
  private _prerequisitesValidator?: PrerequisitesValidator;
  private _rateLimitHandler?: RateLimitHandler;

  constructor(config: DispatcherConfig, workingDirectory?: string) {
    this.config = config;
    this.workingDirectory = workingDirectory;
  }

  /**
   * Creates or returns the GitHub client singleton
   *
   * @returns GitHubClient instance
   */
  getGitHubClient(): GitHubClient {
    if (!this._githubClient) {
      this._githubClient = new GitHubClient();
    }
    return this._githubClient;
  }

  /**
   * Creates or returns the issue queue singleton
   *
   * @returns IssueQueue instance
   */
  getIssueQueue(): IssueQueue {
    if (!this._issueQueue) {
      this._issueQueue = new IssueQueue();
    }
    return this._issueQueue;
  }

  /**
   * Creates or returns the git repository singleton
   *
   * @returns GitRepository instance
   */
  getGitRepository(): GitRepository {
    if (!this._gitRepository) {
      this._gitRepository = new GitRepository(this.workingDirectory);
    }
    return this._gitRepository;
  }

  /**
   * Creates or returns the Claude Code executor singleton
   *
   * @returns ClaudeCodeExecutor instance
   */
  getClaudeExecutor(): ClaudeCodeExecutor {
    if (!this._claudeExecutor) {
      this._claudeExecutor = new ClaudeCodeExecutor({
        workingDirectory: this.workingDirectory,
        allowedTools: this.config.allowedTools,
        disallowedTools: this.config.disallowedTools,
        dangerouslySkipPermissions: this.config.dangerouslySkipPermissions,
        rateLimitRetryDelay: this.config.rateLimitRetryDelay,
      });
    }
    return this._claudeExecutor;
  }

  /**
   * Creates or returns the prompt builder singleton
   *
   * @returns PromptBuilder instance
   */
  getPromptBuilder(): PromptBuilder {
    if (!this._promptBuilder) {
      this._promptBuilder = new PromptBuilder();
    }
    return this._promptBuilder;
  }

  /**
   * Creates or returns the processing state manager singleton
   *
   * @returns ProcessingStateManager instance
   */
  getStateManager(): ProcessingStateManager {
    if (!this._stateManager) {
      this._stateManager = new ProcessingStateManager();
    }
    return this._stateManager;
  }

  /**
   * Creates or returns the prerequisites validator singleton
   *
   * @returns PrerequisitesValidator instance
   */
  getPrerequisitesValidator(): PrerequisitesValidator {
    if (!this._prerequisitesValidator) {
      this._prerequisitesValidator = new PrerequisitesValidator(this.config);
    }
    return this._prerequisitesValidator;
  }

  /**
   * Creates or returns the rate limit handler singleton
   *
   * @returns RateLimitHandler instance
   */
  getRateLimitHandler(): RateLimitHandler {
    if (!this._rateLimitHandler) {
      this._rateLimitHandler = new RateLimitHandler();
    }
    return this._rateLimitHandler;
  }

  /**
   * Creates a new issue poller instance
   *
   * Note: Not cached as singleton since poller might need to be recreated
   * with different configurations during testing or runtime changes.
   *
   * @returns New IssuePoller instance
   */
  createIssuePoller(): IssuePoller {
    return new IssuePoller(
      this.getGitHubClient(),
      this.getIssueQueue(),
      this.config
    );
  }

  /**
   * Creates a new resumable issue processor instance
   *
   * Note: Not cached as singleton since processor might need to be recreated
   * with different configurations during testing.
   *
   * @returns New ResumableIssueProcessor instance
   */
  createResumableIssueProcessor(): ResumableIssueProcessor {
    return new ResumableIssueProcessor(
      this.getGitRepository(),
      this.getClaudeExecutor(),
      this.getPromptBuilder(),
      this.getStateManager()
    );
  }

  /**
   * Creates a new processing manager instance
   *
   * @returns New ProcessingManager instance
   */
  createProcessingManager(): ProcessingManager {
    return new ProcessingManager(
      this.createResumableIssueProcessor(),
      this.getIssueQueue(),
      this.getRateLimitHandler(),
      this.getGitHubClient(),
      this.config
    );
  }

  /**
   * Creates a new status monitor instance
   *
   * @param poller - The issue poller to monitor
   * @param processingManager - The processing manager to monitor
   * @returns New StatusMonitor instance
   */
  createStatusMonitor(
    poller: IssuePoller,
    processingManager: ProcessingManager
  ): StatusMonitor {
    return new StatusMonitor(
      poller,
      this.getIssueQueue(),
      processingManager
    );
  }

  /**
   * Gets the current configuration
   *
   * @returns The dispatcher configuration
   */
  getConfig(): DispatcherConfig {
    return this.config;
  }

  /**
   * Gets the working directory
   *
   * @returns The working directory path, if set
   */
  getWorkingDirectory(): string | undefined {
    return this.workingDirectory;
  }

  /**
   * Resets all singleton instances
   *
   * Useful for testing or when configuration changes require fresh instances.
   * Note: This will not affect already-created instances that are held by other classes.
   *
   * @example
   * ```typescript
   * container.reset();
   * const newGithubClient = container.getGitHubClient(); // Creates fresh instance
   * ```
   */
  reset(): void {
    this._githubClient = undefined;
    this._issueQueue = undefined;
    this._gitRepository = undefined;
    this._claudeExecutor = undefined;
    this._promptBuilder = undefined;
    this._stateManager = undefined;
    this._prerequisitesValidator = undefined;
    this._rateLimitHandler = undefined;
  }
}