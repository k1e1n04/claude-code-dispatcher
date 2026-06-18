import { DispatcherConfig } from '../types/index';
import { ServiceContainer } from './service-container';
import { PrerequisitesValidator } from './prerequisites-validator';
import { IssuePoller } from './poller';
import { ProcessingManager } from './processing-manager';
import { StatusMonitor } from './status-monitor';
import { logger } from '../utils';

/**
 * Central orchestrator for automating GitHub issue processing using Claude Code
 *
 * The DispatcherOrchestrator follows the Single Responsibility Principle by focusing
 * solely on coordinating the specialized components. It delegates specific responsibilities
 * to focused classes:
 * - PrerequisitesValidator: Validates system prerequisites
 * - ProcessingManager: Manages issue processing loop
 * - StatusMonitor: Provides status monitoring and reporting
 * - ServiceContainer: Manages dependency injection
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
 * const orchestrator = new DispatcherOrchestrator(config, '/project/path');
 * await orchestrator.start();
 * ```
 *
 * @since 1.0.0
 */
export class DispatcherOrchestrator {
  private readonly serviceContainer: ServiceContainer;
  private readonly prerequisitesValidator: PrerequisitesValidator;
  
  private poller?: IssuePoller;
  private processingManager?: ProcessingManager;
  private statusMonitor?: StatusMonitor;
  private isRunning = false;

  /**
   * Creates a new DispatcherOrchestrator instance
   *
   * Initializes the service container and prerequisites validator.
   * All other components are created lazily when start() is called.
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
   * const orchestrator = new DispatcherOrchestrator(config, '/project/path');
   * ```
   */
  constructor(config: DispatcherConfig, workingDirectory?: string) {
    this.serviceContainer = new ServiceContainer(config, workingDirectory);
    this.prerequisitesValidator = this.serviceContainer.getPrerequisitesValidator();
  }

  /**
   * Starts the orchestrator and begins monitoring for GitHub issues
   *
   * This method coordinates the startup sequence:
   * 1. Validates prerequisites (delegated to PrerequisitesValidator)
   * 2. Creates and starts the issue poller
   * 3. Creates and starts the processing manager
   * 4. Creates and starts status monitoring
   *
   * @throws {Error} When prerequisites validation fails or startup encounters an error
   *
   * @example
   * ```typescript
   * try {
   *   await orchestrator.start();
   *   console.log('Orchestrator started successfully');
   * } catch (error) {
   *   console.error('Failed to start orchestrator:', error);
   * }
   * ```
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Orchestrator is already running');
      return;
    }

    try {
      logger.info('Starting Claude Code Dispatcher Orchestrator...');

      // Validate prerequisites first
      await this.prerequisitesValidator.validate();

      // Create components
      this.poller = this.serviceContainer.createIssuePoller();
      this.processingManager = this.serviceContainer.createProcessingManager();
      this.statusMonitor = this.serviceContainer.createStatusMonitor(
        this.poller,
        this.processingManager
      );

      // Start all components
      this.isRunning = true;

      await this.poller.start();
      this.processingManager.start();
      this.statusMonitor.startMonitoring();

      logger.info('Claude Code Dispatcher Orchestrator started successfully');
      logger.info('Press Ctrl+C to stop the orchestrator');

    } catch (error) {
      logger.error('Failed to start orchestrator:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stops the orchestrator and cleans up resources
   *
   * This method coordinates the shutdown sequence:
   * - Stops status monitoring
   * - Stops issue processing
   * - Stops issue polling
   * - Cleans up resources
   *
   * Safe to call multiple times - will only stop once.
   *
   * @example
   * ```typescript
   * // Graceful shutdown
   * process.on('SIGINT', async () => {
   *   await orchestrator.stop();
   *   process.exit(0);
   * });
   * ```
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Claude Code Dispatcher Orchestrator...');

    this.isRunning = false;

    // Stop components in reverse order of startup
    // Handle errors gracefully to ensure all components are stopped
    try {
      if (this.statusMonitor) {
        this.statusMonitor.stopMonitoring();
      }
    } catch (error) {
      logger.error('Error stopping status monitor:', error);
    }

    try {
      if (this.processingManager) {
        this.processingManager.stop();
      }
    } catch (error) {
      logger.error('Error stopping processing manager:', error);
    }

    try {
      if (this.poller) {
        this.poller.stop();
      }
    } catch (error) {
      logger.error('Error stopping poller:', error);
    }

    logger.info('Claude Code Dispatcher Orchestrator stopped');
  }

  /**
   * Gets the current status of all orchestrated components
   *
   * Delegates to the StatusMonitor to provide comprehensive status information.
   *
   * @returns Current status including polling state, processing state, queue size, and next issue
   *
   * @example
   * ```typescript
   * const status = orchestrator.getStatus();
   * console.log(`Queue size: ${status.queueSize}`);
   * console.log(`Polling: ${status.polling ? 'Active' : 'Inactive'}`);
   * console.log(`Processing: ${status.processing ? 'Active' : 'Inactive'}`);
   * if (status.nextIssue) {
   *   console.log(`Next issue: #${status.nextIssue.number} - ${status.nextIssue.title}`);
   * }
   * ```
   */
  getStatus() {
    if (!this.statusMonitor) {
      // Return default status if not started
      return {
        polling: false,
        processing: false,
        queueSize: 0,
      };
    }

    return this.statusMonitor.getStatus();
  }

  /**
   * Gets whether the orchestrator is currently running
   *
   * @returns true if the orchestrator is running
   *
   * @example
   * ```typescript
   * if (orchestrator.isActive()) {
   *   console.log('Orchestrator is active');
   * }
   * ```
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Gets the service container for advanced usage
   *
   * Provides access to the underlying service container for testing
   * or advanced configuration scenarios.
   *
   * @returns The service container instance
   *
   * @example
   * ```typescript
   * const container = orchestrator.getServiceContainer();
   * const githubClient = container.getGitHubClient();
   * ```
   */
  getServiceContainer(): ServiceContainer {
    return this.serviceContainer;
  }
}