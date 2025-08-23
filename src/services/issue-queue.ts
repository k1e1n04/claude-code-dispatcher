import { GitHubIssue } from '../types';
import { logger } from '../utils';

/**
 * FIFO queue for managing GitHub issues awaiting processing
 * Provides thread-safe operations and processing state management
 */
export class IssueQueue {
  private queue: GitHubIssue[] = [];
  private processing = false;

  /**
   * Adds issues to the end of the queue, avoiding duplicates
   * @param issues - Array of GitHub issues to enqueue
   */
  enqueue(issues: GitHubIssue[]): void {
    issues.forEach(issue => {
      if (!this.queue.some(queuedIssue => queuedIssue.id === issue.id)) {
        this.queue.push(issue);
        logger.info(`Added issue #${issue.number} to queue: ${issue.title}`);
      }
    });
  }

  /**
   * Removes and returns the first issue from the queue
   * @returns Next issue to process or undefined if queue is empty
   */
  dequeue(): GitHubIssue | undefined {
    const issue = this.queue.shift();
    if (issue) {
      logger.info(`Dequeued issue #${issue.number}: ${issue.title}`);
    }
    return issue;
  }

  peek(): GitHubIssue | undefined {
    return this.queue[0];
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  size(): number {
    return this.queue.length;
  }

  getAll(): GitHubIssue[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
    logger.info('Queue cleared');
  }

  setProcessing(processing: boolean): void {
    this.processing = processing;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  remove(issueId: number): boolean {
    const index = this.queue.findIndex(issue => issue.id === issueId);
    if (index !== -1) {
      const removed = this.queue.splice(index, 1)[0];
      logger.info(`Removed issue #${removed.number} from queue`);
      return true;
    }
    return false;
  }

  /**
   * Gets current queue status information
   * @returns Object containing queue size, processing state, and next issue
   */
  getStatus(): { queueSize: number; processing: boolean; nextIssue?: GitHubIssue } {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      nextIssue: this.peek()
    };
  }
}