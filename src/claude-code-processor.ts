import { execSync } from 'child_process';
import { GitHubIssue, ProcessingResult } from './types';
import { logger } from './logger';
import { RetryHandler } from './logger';

/**
 * Processes GitHub issues using ClaudeCode integration
 * Handles branch management, code generation, and git operations
 */
export class ClaudeCodeProcessor {
  constructor(
    private workingDirectory: string = process.cwd(),
    private allowedTools: string[] = [],
    private disallowedTools: string[] = []
  ) {}

  /**
   * Processes a GitHub issue by creating a branch and generating code
   * @param issue - GitHub issue to process
   * @param baseBranch - Base branch to create feature branch from
   * @returns Processing result with success status and branch information
   */
  async processIssue(issue: GitHubIssue, baseBranch: string): Promise<ProcessingResult> {
    const branchName = this.generateBranchName(issue);
    
    try {
      logger.info(`Processing issue #${issue.number}: ${issue.title}`);
      
      await this.switchToBranch(branchName, baseBranch);
      
      const promptMessage = this.createPromptFromIssue(issue);
      
      await RetryHandler.withRetry(
        () => this.executeClaudeCode(promptMessage),
        3,
        2000,
        `ClaudeCode execution for issue #${issue.number}`
      );
      
      const hasChanges = await this.checkForChanges();
      
      if (!hasChanges) {
        logger.warn(`No changes detected for issue #${issue.number}`);
        return {
          success: false,
          error: 'No changes were made by ClaudeCode'
        };
      }

      const commitPrompt = this.createCommitAndPushPrompt();
      await RetryHandler.withRetry(
        () => this.executeClaudeCode(commitPrompt),
        3,
        2000,
        `ClaudeCode commit and push generation for issue #${issue.number}`
      );
      
      const prPrompt = this.createPullRequestBPrompt(baseBranch);
      await RetryHandler.withRetry(
        () => this.executeClaudeCode(prPrompt),
        3,
        2000,
        `ClaudeCode pull request generation for issue #${issue.number}`
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

  /**
   * Generates a safe branch name from issue number and title
   * @param issue - GitHub issue
   * @returns Sanitized branch name
   */
  private generateBranchName(issue: GitHubIssue): string {
    const sanitizedTitle = issue.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    
    return `issue-${issue.number}-${sanitizedTitle}`;
  }

  private async switchToBranch(branchName: string, baseBranch: string): Promise<void> {
    try {
      logger.info(`Switching to base branch: ${baseBranch}`);
      execSync(`git checkout ${baseBranch}`, { 
        cwd: this.workingDirectory, 
        stdio: 'pipe' 
      });
      
      execSync(`git pull origin ${baseBranch}`, { 
        cwd: this.workingDirectory, 
        stdio: 'pipe' 
      });
      
      logger.info(`Creating and switching to branch: ${branchName}`);
      execSync(`git checkout -b ${branchName}`, { 
        cwd: this.workingDirectory, 
        stdio: 'pipe' 
      });
      
    } catch (error) {
      logger.error(`Failed to switch to branch ${branchName}:`, error);
      throw new Error(`Branch switching failed: ${error}`);
    }
  }

  private createPromptFromIssue(issue: GitHubIssue): string {
    let prompt = 'Please help implement the following GitHub issue:\n\n';
    prompt += `Title: ${issue.title}\n\n`;
    
    if (issue.body) {
      prompt += `Description:\n${issue.body}\n\n`;
    }
    
    prompt += `Issue URL: ${issue.html_url}\n\n`;
    prompt += 'Please implement the required changes and ensure the code follows best practices.';
    
    return prompt;
  }

  private createCommitAndPushPrompt(): string {
    return 'Please create a concise and descriptive commit message summarizing the changes made. The message should follow best practices for commit messages. After committing, please push the changes to the remote repository.';
  }

  private createPullRequestBPrompt(baseBranch: string): string {
    return 'Please create a pull request targeting the base branch ' + baseBranch + '. If a PULL_REQUEST_TEMPLATE exists in the repository, please use it to format the pull request description. Ensure the title is clear and references the issue being addressed.';
  }

  /**
   * Builds the Claude Code command with appropriate tool permissions
   * @returns Complete command string with tool settings
   */
  private buildClaudeCommand(): string {
    let command = 'claude code --print';
    
    // Add allowed tools
    if (this.allowedTools.length > 0) {
      const allowedToolsArgs = this.allowedTools
        .map(tool => `"${tool}"`)
        .join(' ');
      command += ` --allowedTools ${allowedToolsArgs}`;
    }
    
    // Add disallowed tools if specified
    if (this.disallowedTools && this.disallowedTools.length > 0) {
      const disallowedToolsArgs = this.disallowedTools
        .map(tool => `"${tool}"`)
        .join(' ');
      command += ` --disallowedTools ${disallowedToolsArgs}`;
    }
    
    return command;
  }

  /**
   * Executes ClaudeCode with the provided prompt
   * @param prompt - Formatted prompt containing issue details
   */
  private async executeClaudeCode(prompt: string): Promise<void> {
    try {
      logger.info('Executing ClaudeCode via stdin...');

      const command = this.buildClaudeCommand();
      const output = execSync(command, {
        cwd: this.workingDirectory,
        input: prompt,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'],
        timeout: 300000
      });
      
      logger.info(`ClaudeCode response: ${output.substring(0, 200)}...`);
      // Detect rate-limit or quota messages and treat them as non-retryable
      if (/limit reached|rate limit|quota/i.test(output)) {
        type NonRetryableError = Error & { nonRetryable: true };
        const err = new Error(`ClaudeCode rate limit/quota reached: ${output.trim().split('\n')[0]}`) as NonRetryableError;
        err.nonRetryable = true;
        throw err;
      }
      
      logger.info('ClaudeCode execution completed');
    } catch (error) {
      // If execSync produced stdout with a rate-limit message, attach nonRetryable flag
      const errObj = error as unknown as { stdout?: string; message?: string };
      const stderrLike = errObj?.stdout || errObj?.message || String(error);
      if (/limit reached|rate limit|quota/i.test(String(stderrLike))) {
        type NonRetryableError = Error & { nonRetryable: true };
        const e = new Error(`ClaudeCode execution failed: ${stderrLike}`) as NonRetryableError;
        e.nonRetryable = true;
        logger.error('ClaudeCode execution failed (non-retryable):', e);
        throw e;
      }

      logger.error('ClaudeCode execution failed:', error);
      throw new Error(`ClaudeCode execution failed: ${error}`);
    }
  }

  private async checkForChanges(): Promise<boolean> {
    try {
      const output = execSync('git status --porcelain', { 
        cwd: this.workingDirectory, 
        encoding: 'utf8' 
      });
      
      return output.trim().length > 0;
    } catch (error) {
      logger.error('Failed to check for changes:', error);
      return false;
    }
  }
}