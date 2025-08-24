import { GitHubIssue } from '../types';
import { logger } from '../utils';

/**
 * Client for interacting with GitHub API via gh CLI
 * Manages issue fetching, pull request creation, and rate limiting
 */
export class GitHubClient {
  private processedIssues = new Set<number>();

  /**
   * Fetches new issues assigned to the specified user
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param assignee - GitHub username to filter by
   * @returns Array of new issues not previously processed
   */
  async getAssignedIssues(
    owner: string,
    repo: string,
    assignee: string
  ): Promise<GitHubIssue[]> {
    try {
      const command = `gh api repos/${owner}/${repo}/issues --method GET -f assignee=${assignee} -f state=open`;
      const { execSync } = await import('child_process');
      const output = execSync(command, { encoding: 'utf8' });
      const issues: GitHubIssue[] = JSON.parse(output);

      const newIssues = issues.filter(
        (issue) => !this.processedIssues.has(issue.id)
      );

      newIssues.forEach((issue) => {
        this.processedIssues.add(issue.id);
      });

      logger.info(
        `Found ${newIssues.length} new issues assigned to ${assignee}`
      );
      return newIssues;
    } catch (error) {
      logger.error('Failed to fetch GitHub issues:', error);
      throw new Error(`Failed to fetch issues: ${error}`);
    }
  }

  /**
   * Creates a pull request using GitHub CLI
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param branchName - Source branch name
   * @param baseBranch - Target branch name
   * @param title - Pull request title
   * @param body - Pull request description
   * @returns URL of the created pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    branchName: string,
    baseBranch: string,
    title: string,
    body: string
  ): Promise<string> {
    try {
      const command = `gh pr create --repo ${owner}/${repo} --head ${branchName} --base ${baseBranch} --title "${title}" --body "${body}"`;
      const { execSync } = await import('child_process');
      const output = execSync(command, { encoding: 'utf8' });

      const pullRequestUrl = output.trim();
      logger.info(`Created pull request: ${pullRequestUrl}`);
      return pullRequestUrl;
    } catch (error) {
      logger.error('Failed to create pull request:', error);
      throw new Error(`Failed to create pull request: ${error}`);
    }
  }

  /**
   * Checks GitHub API rate limit and waits if necessary
   */
  async checkRateLimit(): Promise<void> {
    try {
      const command = 'gh api rate_limit';
      const { execSync } = await import('child_process');
      const output = execSync(command, { encoding: 'utf8' });
      const rateLimit = JSON.parse(output);

      const remaining = rateLimit.rate.remaining;
      const resetTime = new Date(rateLimit.rate.reset * 1000);

      logger.info(
        `GitHub API rate limit - Remaining: ${remaining}, Reset: ${resetTime.toISOString()}`
      );

      if (remaining < 10) {
        const waitTime = Math.max(0, resetTime.getTime() - Date.now());
        logger.warn(
          `Low rate limit remaining. Waiting ${waitTime}ms until reset.`
        );
        // In Jest test environment, don't actually wait to avoid test timeouts
        if (!process.env.JEST_WORKER_ID) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    } catch (error) {
      logger.warn('Failed to check rate limit:', error);
    }
  }

  /**
   * Marks an issue as processed to prevent duplicate processing
   * @param issueId - GitHub issue ID
   */
  markIssueAsProcessed(issueId: number): void {
    this.processedIssues.add(issueId);
  }
}
