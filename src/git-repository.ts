import { execSync } from 'child_process';
import { GitHubIssue } from './types';
import { logger } from './logger';

/**
 * Interface for Git repository operations
 */
export interface IGitRepository {
  switchToBranch(branchName: string, baseBranch: string): Promise<void>;
  checkForChanges(): Promise<boolean>;
  generateBranchName(issue: GitHubIssue): string;
}

/**
 * Handles Git repository operations for the Claude Code dispatcher
 */
export class GitRepository implements IGitRepository {
  constructor(private workingDirectory: string = process.cwd()) {}

  /**
   * Generates a safe branch name from issue number and title
   * @param issue - GitHub issue
   * @returns Sanitized branch name
   */
  generateBranchName(issue: GitHubIssue): string {
    const sanitizedTitle = issue.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    
    return `issue-${issue.number}-${sanitizedTitle}`;
  }

  /**
   * Switches to a new branch based on the base branch
   * @param branchName - Name of the new branch to create
   * @param baseBranch - Base branch to create from
   */
  async switchToBranch(branchName: string, baseBranch: string): Promise<void> {
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

  /**
   * Checks if there are any changes in the working directory
   * @returns True if there are changes, false otherwise
   */
  async checkForChanges(): Promise<boolean> {
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