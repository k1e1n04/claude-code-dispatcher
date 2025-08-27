import { execSync } from 'child_process';
import { GitHubIssue } from '../types';
import { logger } from '../utils';

/**
 * Interface for Git repository operations
 */
export interface IGitRepository {
  switchToBranch(branchName: string, baseBranch: string): Promise<void>;
  checkForChanges(): Promise<boolean>;
  generateBranchName(issue: GitHubIssue): string;
  deleteBranch(branchName: string, baseBranch: string): void;
  discardChanges(): void;
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

  /**
   * Deletes a local branch if it exists
   * @param branchName - Name of the branch to delete
   * @param baseBranch - Base branch to switch to before deletion
   */
  deleteBranch(branchName: string, baseBranch: string): void {
    try {
      // Switch to base branch before deleting branch
      execSync(`git checkout ${baseBranch}`, { 
        cwd: this.workingDirectory, 
        stdio: 'pipe' 
      });

      // Delete local branch if it exists
      try {
        execSync(`git branch -D ${branchName}`, { 
          cwd: this.workingDirectory, 
          stdio: 'pipe' 
        });
        logger.info(`Deleted local branch: ${branchName}`);
      } catch {
        logger.debug(`Local branch ${branchName} does not exist or already deleted`);
      }

    } catch (error) {
      logger.warn(`Failed to cleanup branch ${branchName}:`, error);
      // Don't throw error as branch cleanup is not critical
    }
  }

  /**
   * Discards all uncommitted changes in the working directory
   */
  discardChanges(): void {
    try {
      execSync('git restore .', { 
        cwd: this.workingDirectory, 
        stdio: 'pipe' 
      });
      execSync('git clean -fd', {
        cwd: this.workingDirectory, 
        stdio: 'pipe' 
      });
      logger.info('Discarded all uncommitted changes');
    } catch (error) {
      logger.warn('Failed to discard changes:', error);
      // Don't throw error as discarding changes is not critical
    }
  }
}
