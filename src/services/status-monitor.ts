import { GitHubIssue } from '../types/index';
import { IssuePoller } from './poller';
import { IssueQueue } from './issue-queue';
import { ProcessingManager } from './processing-manager';
import { logger } from '../utils';

/**
 * Status information about the dispatcher components
 */
export interface DispatcherStatus {
  polling: boolean;
  processing: boolean;
  queueSize: number;
  nextIssue?: GitHubIssue;
}

/**
 * Monitors system status and provides periodic reporting
 *
 * This class follows the Single Responsibility Principle by focusing solely on
 * status monitoring and reporting. It aggregates status from various components
 * and provides periodic logging and status retrieval functionality.
 *
 * @example
 * ```typescript
 * const statusMonitor = new StatusMonitor(poller, issueQueue, processingManager);
 * statusMonitor.startMonitoring();
 * const status = statusMonitor.getStatus();
 * ```
 *
 * @since 1.0.0
 */
export class StatusMonitor {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private readonly MONITORING_INTERVAL_MS = 30000; // 30 seconds

  constructor(
    private poller: IssuePoller,
    private issueQueue: IssueQueue,
    private processingManager: ProcessingManager
  ) {}

  /**
   * Starts periodic status monitoring
   *
   * Begins logging status updates every 30 seconds including queue size,
   * processing state, polling state, and next issue information.
   * Safe to call multiple times - will only start monitoring once.
   *
   * @example
   * ```typescript
   * statusMonitor.startMonitoring();
   * console.log('Status monitoring started');
   * ```
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      logger.warn('Status monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting status monitoring...');

    this.monitoringInterval = setInterval(() => {
      if (!this.isMonitoring) {
        this.stopMonitoring();
        return;
      }

      this.logStatus();
    }, this.MONITORING_INTERVAL_MS);

    logger.debug(`Status monitoring started with ${this.MONITORING_INTERVAL_MS}ms interval`);
  }

  /**
   * Stops periodic status monitoring
   *
   * Gracefully shuts down status monitoring and clears any pending intervals.
   * Safe to call multiple times.
   *
   * @example
   * ```typescript
   * statusMonitor.stopMonitoring();
   * console.log('Status monitoring stopped');
   * ```
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    logger.info('Stopping status monitoring...');
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.debug('Status monitoring stopped');
  }

  /**
   * Gets the current status of all dispatcher components
   *
   * Aggregates status from the poller, issue queue, and processing manager
   * to provide a comprehensive view of the system state.
   *
   * @returns Current status including polling state, processing state, queue size, and next issue
   *
   * @example
   * ```typescript
   * const status = statusMonitor.getStatus();
   * console.log(`Queue size: ${status.queueSize}`);
   * console.log(`Polling: ${status.polling ? 'Active' : 'Inactive'}`);
   * console.log(`Processing: ${status.processing ? 'Active' : 'Inactive'}`);
   * if (status.nextIssue) {
   *   console.log(`Next issue: #${status.nextIssue.number} - ${status.nextIssue.title}`);
   * }
   * ```
   */
  getStatus(): DispatcherStatus {
    const pollerStatus = this.poller.getStatus();
    const queueStatus = this.issueQueue.getStatus();

    return {
      polling: pollerStatus.running,
      processing: queueStatus.processing,
      queueSize: queueStatus.queueSize,
      nextIssue: queueStatus.nextIssue,
    };
  }

  /**
   * Gets the current monitoring state
   *
   * @returns true if status monitoring is currently active
   *
   * @example
   * ```typescript
   * const monitoring = statusMonitor.isCurrentlyMonitoring();
   * console.log(`Status monitoring active: ${monitoring}`);
   * ```
   */
  isCurrentlyMonitoring(): boolean {
    return this.isMonitoring;
  }

  /**
   * Forces an immediate status log
   *
   * Useful for debugging or getting immediate status information
   * without waiting for the next scheduled status update.
   *
   * @example
   * ```typescript
   * statusMonitor.logStatusNow();
   * ```
   */
  logStatusNow(): void {
    this.logStatus();
  }

  /**
   * Logs the current status to the logger
   *
   * @private
   */
  private logStatus(): void {
    const status = this.getStatus();
    const processingStatus = status.processing ? 'Yes' : 'No';

    logger.info(
      `Status - Queue: ${status.queueSize}, Processing: ${processingStatus}, Polling: ${
        status.polling ? 'Yes' : 'No'
      }`
    );

    if (status.nextIssue && !status.processing && status.queueSize > 0) {
      logger.info(
        `Next issue in queue: #${status.nextIssue.number} - ${status.nextIssue.title}`
      );
    }

    // Log additional debug information
    logger.debug(
      `Detailed status - Monitoring active: ${this.isMonitoring}, ` +
      `Interval: ${this.MONITORING_INTERVAL_MS}ms`
    );
  }
}