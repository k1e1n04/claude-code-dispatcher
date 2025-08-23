import { execSync } from 'child_process';
import { GitHubIssue, ProcessingResult } from './types';
import { logger } from './logger';
import { RetryHandler } from './logger';

/**
 * Processes GitHub issues using ClaudeCode integration
 * Handles branch management, code generation, and git operations
 */
export class ClaudeCodeProcessor {
  constructor(private workingDirectory: string = process.cwd()) {}

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
      
      await this.commitChanges(issue);
      await this.pushBranch(branchName);
      
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

  /**
   * Executes ClaudeCode with the provided prompt
   * @param prompt - Formatted prompt containing issue details
   */
  private async executeClaudeCode(prompt: string): Promise<void> {
    try {
      logger.info('Executing ClaudeCode via stdin...');
      
  const command = 'claude code';
  execSync(command, {
        cwd: this.workingDirectory,
        input: prompt,
        encoding: 'utf8',
        stdio: ['pipe', 'inherit', 'inherit'],
        timeout: 300000
      });
      
      logger.info('ClaudeCode execution completed');
    } catch (error) {
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

  private async commitChanges(issue: GitHubIssue): Promise<void> {
    try {
      logger.info('Committing changes...');
      
      execSync('git add .', { 
        cwd: this.workingDirectory, 
        stdio: 'pipe' 
      });
      
      const commitMessage = `Implement issue #${issue.number}: ${issue.title}

${issue.body || 'No description provided'}

Closes #${issue.number}

🤖 Generated with Claude Code Dispatcher
Co-Authored-By: Claude <noreply@anthropic.com>`;
      
      execSync(`git commit -m "${commitMessage}"`, { 
        cwd: this.workingDirectory, 
        stdio: 'pipe' 
      });
      
      logger.info('Changes committed successfully');
    } catch (error) {
      logger.error('Failed to commit changes:', error);
      throw new Error(`Commit failed: ${error}`);
    }
  }

  private async pushBranch(branchName: string): Promise<void> {
    try {
      logger.info(`Pushing branch: ${branchName}`);
      
      execSync(`git push -u origin ${branchName}`, { 
        cwd: this.workingDirectory, 
        stdio: 'pipe' 
      });
      
      logger.info('Branch pushed successfully');
    } catch (error) {
      logger.error('Failed to push branch:', error);
      throw new Error(`Push failed: ${error}`);
    }
  }
}