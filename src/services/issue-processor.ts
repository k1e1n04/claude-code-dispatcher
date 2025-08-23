import { GitHubIssue, ProcessingResult } from '../types';
import { logger, RetryHandler } from '../utils';
import { IGitRepository } from '../infrastructure';
import { IClaudeCodeExecutor } from '../clients';
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
    
    try {
      logger.info(`Processing issue #${issue.number}: ${issue.title}`);
      
      // Step 1: Switch to new branch
      await this.gitRepository.switchToBranch(branchName, baseBranch);
      
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
      logger.error(`Failed to process issue #${issue.number}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}