import { GitHubIssue, ResumableProcessingResult } from '../types/index';
import { logger } from '../utils';

/**
 * Handles rate limit errors and retry logic
 *
 * This class follows the Single Responsibility Principle by focusing solely on
 * rate limit handling. It manages the retry logic and logging when rate limits
 * are encountered during issue processing.
 *
 * @example
 * ```typescript
 * const rateLimitHandler = new RateLimitHandler();
 * const shouldRetry = await rateLimitHandler.handleRateLimit(issue, result);
 * ```
 *
 * @since 1.0.0
 */
export class RateLimitHandler {
  constructor() {}

  /**
   * Handles rate limit errors and determines if processing should be retried
   *
   * When a rate limit is encountered during issue processing, this method:
   * 1. Logs the rate limit event with appropriate context
   * 2. Determines if the issue should remain in queue for retry
   * 3. Returns false to keep the issue in queue for later processing
   *
   * @param issue - The GitHub issue that encountered a rate limit
   * @param result - The processing result that indicates a rate limit occurred
   * @returns Promise that resolves to false (keep in queue for retry)
   *
   * @example
   * ```typescript
   * if (result.shouldResume) {
   *   const shouldRetry = await rateLimitHandler.handleRateLimit(issue, result);
   *   // shouldRetry will be false, indicating the issue should stay in queue
   * }
   * ```
   */
  async handleRateLimit(
    issue: GitHubIssue,
    result: ResumableProcessingResult
  ): Promise<boolean> {
    // Log the rate limit event with context
    logger.info(
      `Issue #${issue.number} processing paused due to rate limit at step ${result.currentState?.currentStep}. Will resume later.`
    );

    // Log additional context if available
    if (result.currentState) {
      logger.debug(
        `Rate limit context - Branch: ${result.currentState.branchName}, ` +
        `Completed steps: ${result.currentState.completedSteps.join(', ')}, ` +
        `Retry count: ${result.currentState.retryCount}`
      );
    }

    if (result.error) {
      logger.debug(`Rate limit error details: ${result.error}`);
    }

    // Return false to keep issue in queue for resume
    return false;
  }

  /**
   * Determines if a processing result indicates a rate limit was encountered
   *
   * @param result - The processing result to check
   * @returns true if the result indicates a rate limit occurred
   *
   * @example
   * ```typescript
   * if (rateLimitHandler.isRateLimited(result)) {
   *   await rateLimitHandler.handleRateLimit(issue, result);
   * }
   * ```
   */
  isRateLimited(result: ResumableProcessingResult): boolean {
    return result.shouldResume === true && !result.success;
  }

  /**
   * Gets a human-readable description of the rate limit situation
   *
   * @param result - The processing result that contains rate limit information
   * @returns A descriptive string about the rate limit status
   *
   * @example
   * ```typescript
   * const description = rateLimitHandler.getRateLimitDescription(result);
   * console.log(`Rate limit status: ${description}`);
   * ```
   */
  getRateLimitDescription(result: ResumableProcessingResult): string {
    if (!this.isRateLimited(result)) {
      return 'No rate limit detected';
    }

    const step = result.currentState?.currentStep || 'unknown';
    const retryCount = result.currentState?.retryCount || 0;
    
    return `Rate limited at step '${step}' (retry ${retryCount})`;
  }
}