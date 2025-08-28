import { GitHubIssue, ProcessingStep, ProcessingState, ResumableProcessingResult } from '../types/index';
import { logger, RetryHandler } from '../utils';
import { IGitRepository } from '../infrastructure';
import { IClaudeCodeExecutor, RateLimitError } from '../clients';
import { IPromptBuilder } from '../utils';
import { ProcessingStateManager } from './processing-state-manager';

/**
 * Processes GitHub issues with resumable state management for rate limit recovery
 * This class can resume processing from any checkpoint after rate limit delays
 */
export class ResumableIssueProcessor {
  constructor(
    private gitRepository: IGitRepository,
    private claudeExecutor: IClaudeCodeExecutor,
    private promptBuilder: IPromptBuilder,
    private stateManager: ProcessingStateManager
  ) {}

  /**
   * Processes a GitHub issue with resumable state management
   * @param issue - GitHub issue to process
   * @param baseBranch - Base branch to create feature branch from
   * @returns Resumable processing result with state information
   */
  async processIssue(issue: GitHubIssue, baseBranch: string): Promise<ResumableProcessingResult> {
    // Check if we have existing state for this issue
    let state = this.stateManager.loadState(issue.id);
    const branchName = this.gitRepository.generateBranchName(issue);
    
    // Create initial state if none exists
    if (!state) {
      state = this.stateManager.createInitialState(issue.id, branchName, baseBranch);
    }

    try {
      logger.info(`Processing issue #${issue.number}: ${issue.title} from step ${state.currentStep}`);

      // Process each step based on current state
      await this.processFromStep(issue, state);

      // Mark as completed and cleanup state
      this.stateManager.cleanupState(issue.id);
      
      return {
        success: true,
        branchName: state.branchName,
        pullRequestUrl: undefined,
        shouldResume: false,
        currentState: undefined
      };

    } catch (error) {
      if (error instanceof RateLimitError) {
        // Save current state for resume after rate limit
        this.stateManager.incrementRetryCount(issue.id);
        logger.info(`Rate limit hit during ${state.currentStep} for issue #${issue.number}. State saved for resume.`);
        
        return {
          success: false,
          error: error.message,
          shouldResume: true,
          currentState: state,
          branchName: state.branchName
        };
      }

      // For non-rate-limit errors, cleanup branch and state
      this.cleanupOnError(state, 'processing error');
      this.stateManager.cleanupState(issue.id);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        shouldResume: false
      };
    }
  }

  /**
   * Processes steps starting from the current state
   * @private
   * @param issue - The GitHub issue being processed
   * @param state - Current processing state
   */
  private async processFromStep(issue: GitHubIssue, state: ProcessingState): Promise<void> {
    // Skip completed steps and resume from current step
    switch (state.currentStep) {
      case ProcessingStep.BRANCH_CREATION:
        await this.handleBranchCreation(issue, state);
        // Fall through to next step
        
      case ProcessingStep.IMPLEMENTATION:
        if (state.currentStep === ProcessingStep.IMPLEMENTATION) {
          await this.handleImplementation(issue, state);
        }
        // Fall through to next step
        
      case ProcessingStep.CHANGE_DETECTION:
        if (state.currentStep === ProcessingStep.CHANGE_DETECTION) {
          await this.handleChangeDetection(issue, state);
        }
        // Fall through to next step
        
      case ProcessingStep.COMMIT_PUSH:
        if (state.currentStep === ProcessingStep.COMMIT_PUSH) {
          await this.handleCommitPush(issue, state);
        }
        // Fall through to next step
        
      case ProcessingStep.PR_CREATION:
        if (state.currentStep === ProcessingStep.PR_CREATION) {
          await this.handlePRCreation(issue, state);
        }
        // Fall through to completion
        
      case ProcessingStep.COMPLETED:
        state.currentStep = ProcessingStep.COMPLETED;
        this.stateManager.updateStep(issue.id, ProcessingStep.COMPLETED, ProcessingStep.PR_CREATION);
        break;
    }
  }

  /**
   * Handles branch creation step
   * @private
   */
  private async handleBranchCreation(issue: GitHubIssue, state: ProcessingState): Promise<void> {
    if (!state.completedSteps.includes(ProcessingStep.BRANCH_CREATION)) {
      logger.info(`Creating branch for issue #${issue.number}`);
      await this.gitRepository.switchToBranch(state.branchName, state.baseBranch);
      
      // Mark step as completed and move to next
      this.stateManager.updateStep(issue.id, ProcessingStep.IMPLEMENTATION, ProcessingStep.BRANCH_CREATION);
      state.currentStep = ProcessingStep.IMPLEMENTATION;
      state.completedSteps.push(ProcessingStep.BRANCH_CREATION);
    }
  }

  /**
   * Handles implementation step
   * @private
   */
  private async handleImplementation(issue: GitHubIssue, state: ProcessingState): Promise<void> {
    if (!state.completedSteps.includes(ProcessingStep.IMPLEMENTATION)) {
      logger.info(`Executing implementation for issue #${issue.number}`);
      const implementationPrompt = this.promptBuilder.createImplementationPrompt(issue);
      
      await RetryHandler.withRetry(
        () => this.claudeExecutor.execute(implementationPrompt),
        3,
        2000,
        `ClaudeCode execution for issue #${issue.number}`
      );

      // Mark step as completed and move to next
      this.stateManager.updateStep(issue.id, ProcessingStep.CHANGE_DETECTION, ProcessingStep.IMPLEMENTATION);
      state.currentStep = ProcessingStep.CHANGE_DETECTION;
      state.completedSteps.push(ProcessingStep.IMPLEMENTATION);
    }
  }

  /**
   * Handles change detection step
   * @private
   */
  private async handleChangeDetection(issue: GitHubIssue, state: ProcessingState): Promise<void> {
    if (!state.completedSteps.includes(ProcessingStep.CHANGE_DETECTION)) {
      logger.info(`Checking for changes for issue #${issue.number}`);
      const hasChanges = await this.gitRepository.checkForChanges();
      
      if (!hasChanges) {
        // No changes made, cleanup and throw error
        this.cleanupOnError(state, 'no changes made');
        throw new Error('No changes were made by ClaudeCode');
      }

      // Mark step as completed and move to next
      this.stateManager.updateStep(issue.id, ProcessingStep.COMMIT_PUSH, ProcessingStep.CHANGE_DETECTION);
      state.currentStep = ProcessingStep.COMMIT_PUSH;
      state.completedSteps.push(ProcessingStep.CHANGE_DETECTION);
    }
  }

  /**
   * Handles commit and push step
   * @private
   */
  private async handleCommitPush(issue: GitHubIssue, state: ProcessingState): Promise<void> {
    if (!state.completedSteps.includes(ProcessingStep.COMMIT_PUSH)) {
      logger.info(`Committing and pushing for issue #${issue.number}`);
      const commitPrompt = this.promptBuilder.createCommitPrompt();
      
      await RetryHandler.withRetry(
        () => this.claudeExecutor.execute(commitPrompt),
        3,
        2000,
        `ClaudeCode commit and push for issue #${issue.number}`
      );

      // Mark step as completed and move to next
      this.stateManager.updateStep(issue.id, ProcessingStep.PR_CREATION, ProcessingStep.COMMIT_PUSH);
      state.currentStep = ProcessingStep.PR_CREATION;
      state.completedSteps.push(ProcessingStep.COMMIT_PUSH);
    }
  }

  /**
   * Handles PR creation step
   * @private
   */
  private async handlePRCreation(issue: GitHubIssue, state: ProcessingState): Promise<void> {
    if (!state.completedSteps.includes(ProcessingStep.PR_CREATION)) {
      logger.info(`Creating pull request for issue #${issue.number}`);
      const prPrompt = this.promptBuilder.createPullRequestPrompt(state.baseBranch);
      
      await RetryHandler.withRetry(
        () => this.claudeExecutor.execute(prPrompt),
        3,
        2000,
        `ClaudeCode pull request creation for issue #${issue.number}`
      );

      // Mark step as completed
      this.stateManager.updateStep(issue.id, ProcessingStep.COMPLETED, ProcessingStep.PR_CREATION);
      state.currentStep = ProcessingStep.COMPLETED;
      state.completedSteps.push(ProcessingStep.PR_CREATION);
    }
  }

  /**
   * Cleans up branch and changes on error (but not rate limit)
   * @private
   */
  private cleanupOnError(state: ProcessingState, reason: string): void {
    try {
      logger.info(`Cleaning up branch ${state.branchName} due to ${reason}`);
      this.gitRepository.discardChanges();
      this.gitRepository.deleteBranch(state.branchName, state.baseBranch);
    } catch (cleanupError) {
      logger.warn(`Failed to cleanup branch ${state.branchName}:`, cleanupError);
    }
  }

  /**
   * Resume processing for an existing issue state
   * @param issueId - The issue ID to resume
   * @param issue - The GitHub issue object  
   * @returns Resumable processing result
   */
  async resumeIssue(issueId: number, issue: GitHubIssue): Promise<ResumableProcessingResult> {
    const state = this.stateManager.loadState(issueId);
    
    if (!state) {
      return {
        success: false,
        error: `No processing state found for issue #${issueId}`,
        shouldResume: false
      };
    }

    logger.info(`Resuming issue #${issueId} from step ${state.currentStep}`);
    return this.processIssue(issue, state.baseBranch);
  }
}
