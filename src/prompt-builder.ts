import { GitHubIssue } from './types';

/**
 * Interface for building different types of prompts for Claude Code
 */
export interface IPromptBuilder {
  createImplementationPrompt(issue: GitHubIssue): string;
  createCommitPrompt(): string;
  createPullRequestPrompt(baseBranch: string): string;
}

/**
 * Builds various prompts for different stages of issue processing
 */
export class PromptBuilder implements IPromptBuilder {
  /**
   * Creates a prompt for implementing the GitHub issue
   * @param issue - GitHub issue to implement
   * @returns Formatted implementation prompt
   */
  createImplementationPrompt(issue: GitHubIssue): string {
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
   * Creates a prompt for committing and pushing changes
   * @returns Commit and push prompt
   */
  createCommitPrompt(): string {
    return 'Please create a concise and descriptive commit message summarizing the changes made. The message should follow best practices for commit messages. After committing, please push the changes to the remote repository.';
  }

  /**
   * Creates a prompt for creating a pull request
   * @param baseBranch - The base branch to target for the PR
   * @returns Pull request creation prompt
   */
  createPullRequestPrompt(baseBranch: string): string {
    return `Please create a pull request targeting the base branch ${baseBranch}. If a PULL_REQUEST_TEMPLATE exists in the repository, please use it to format the pull request description. Ensure the title is clear and references the issue being addressed.`;
  }
}