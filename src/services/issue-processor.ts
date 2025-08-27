import { GitHubIssue, ProcessingResult } from '../types';
import { logger, RetryHandler } from '../utils';
import { IGitRepository } from '../infrastructure';
import { IClaudeCodeExecutor, RateLimitError } from '../clients';
import { IPromptBuilder } from '../utils';

/**
 * Processes GitHub issues using dependency-injected components
 * This class orchestrates the issue processing workflow
 */
export class IssueProcessor {
  constructor(
    private gitRepository: IGitRepository,
    private claudeExecutor: IClaudeCodeExecutor,
    private promptBuilder: IPromptBuilder
  ) {}

  /**
   * Processes a GitHub issue by creating a branch and generating code
   * @param issue - GitHub issue to process
   * @param baseBranch - Base branch to create feature branch from
   * @returns Processing result with success status and branch information
   */
  async processIssue(issue: GitHubIssue, baseBranch: string): Promise<ProcessingResult> {
    const branchName = this.gitRepository.generateBranchName(issue);
    let branchCreated = false;
    
    try {
      logger.info(`Processing issue #${issue.number}: ${issue.title}`);
      
      // Step 1: Switch to new branch
      await this.gitRepository.switchToBranch(branchName, baseBranch);
      branchCreated = true;
      
      // Step 2: Execute implementation
      const implementationPrompt = this.promptBuilder.createImplementationPrompt(issue);
      await RetryHandler.withRetry(
        () => this.claudeExecutor.execute(implementationPrompt),
        3,
        2000,
        `ClaudeCode execution for issue #${issue.number}`
      );
      
      // Step 3: Check for changes
      const hasChanges = await this.gitRepository.checkForChanges();
      if (!hasChanges) {
        logger.warn(`No changes detected for issue #${issue.number}`);
        // Cleanup branch since Claude Code didn't make any changes
        this.cleanupBranch(branchName, baseBranch, 'no changes made');
        return {
          success: false,
          error: 'No changes were made by ClaudeCode'
        };
      }

      // Step 4: Commit and push
      const commitPrompt = this.promptBuilder.createCommitPrompt();
      await RetryHandler.withRetry(
        () => this.claudeExecutor.execute(commitPrompt),
        3,
        2000,
        `ClaudeCode commit and push for issue #${issue.number}`
      );
      
      // Step 5: Create pull request
      const prPrompt = this.promptBuilder.createPullRequestPrompt(baseBranch);
      await RetryHandler.withRetry(
        () => this.claudeExecutor.execute(prPrompt),
        3,
        2000,
        `ClaudeCode pull request creation for issue #${issue.number}`
      );
      
      return {
        success: true,
        branchName,
        pullRequestUrl: undefined
      };
      
    } catch (error) {
      // Only cleanup branch if it was created and Claude Code execution failed
      if (branchCreated) {
        this.cleanupBranch(branchName, baseBranch, 'Claude Code execution failure');
      }
      
      // Let RateLimitError bubble up to be handled by dispatcher
      if (error instanceof RateLimitError) {
        throw error;
      }
      
      logger.error(`Failed to process issue #${issue.number}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Cleans up a branch when processing fails
   * @param branchName - Name of the branch to cleanup
   * @param baseBranch - Base branch to switch to before deletion
   * @param reason - Reason for cleanup (for logging)
   */
  private cleanupBranch(branchName: string, baseBranch: string, reason: string): void {
    try {
      logger.info(`Cleaning up branch ${branchName} due to ${reason}`);
      this.gitRepository.discardChanges();
      this.gitRepository.deleteBranch(branchName, baseBranch);
    } catch (cleanupError) {
      logger.warn(`Failed to cleanup branch ${branchName}:`, cleanupError);
    }
  }
}
