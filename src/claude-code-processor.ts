import { GitHubIssue, ProcessingResult } from './types';
import { GitRepository } from './git-repository';
import { ClaudeCodeExecutor } from './claude-executor';
import { PromptBuilder } from './prompt-builder';
import { IssueProcessor } from './issue-processor';

/**
 * Legacy wrapper for ClaudeCodeProcessor maintaining backward compatibility
 * @deprecated Use IssueProcessor with dependency injection instead
 */
export class ClaudeCodeProcessor {
  private issueProcessor: IssueProcessor;

  constructor(
    workingDirectory: string = process.cwd(),
    allowedTools: string[] = [],
    disallowedTools: string[] = [],
    dangerouslySkipPermissions: boolean = false
  ) {
    // Create dependencies with injected configuration
    const gitRepository = new GitRepository(workingDirectory);
    const claudeExecutor = new ClaudeCodeExecutor({
      workingDirectory,
      allowedTools,
      disallowedTools,
      dangerouslySkipPermissions
    });
    const promptBuilder = new PromptBuilder();

    // Create the new issue processor with dependencies
    this.issueProcessor = new IssueProcessor(gitRepository, claudeExecutor, promptBuilder);
  }

  /**
   * Processes a GitHub issue by creating a branch and generating code
   * @param issue - GitHub issue to process
   * @param baseBranch - Base branch to create feature branch from
   * @returns Processing result with success status and branch information
   */
  async processIssue(issue: GitHubIssue, baseBranch: string): Promise<ProcessingResult> {
    return this.issueProcessor.processIssue(issue, baseBranch);
  }

}