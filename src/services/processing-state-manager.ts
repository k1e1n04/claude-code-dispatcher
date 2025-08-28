import * as fs from 'fs';
import * as path from 'path';
import { ProcessingState, ProcessingStep } from '../types/index';
import { logger } from '../utils';

/**
 * Manages processing state persistence and recovery for rate limit scenarios
 */
export class ProcessingStateManager {
  private stateDirectory: string;

  constructor(stateDirectory: string = '.claude-state') {
    this.stateDirectory = stateDirectory;
    this.ensureStateDirectory();
  }

  /**
   * Saves the current processing state for an issue
   * @param state - The processing state to save
   */
  saveState(state: ProcessingState): void {
    try {
      const stateFile = this.getStateFilePath(state.issueId);
      const stateData = {
        ...state,
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(stateFile, JSON.stringify(stateData, null, 2), 'utf8');
      logger.info(`Saved processing state for issue #${state.issueId} at step ${state.currentStep}`);
    } catch (error) {
      logger.warn(`Failed to save processing state for issue #${state.issueId}:`, error);
    }
  }

  /**
   * Loads the processing state for an issue
   * @param issueId - The issue ID to load state for
   * @returns The processing state or null if not found
   */
  loadState(issueId: number): ProcessingState | null {
    try {
      const stateFile = this.getStateFilePath(issueId);
      
      if (!fs.existsSync(stateFile)) {
        return null;
      }

      const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      
      // Convert date string back to Date object
      stateData.lastUpdated = new Date(stateData.lastUpdated);
      
      logger.info(`Loaded processing state for issue #${issueId} at step ${stateData.currentStep}`);
      return stateData;
    } catch (error) {
      logger.warn(`Failed to load processing state for issue #${issueId}:`, error);
      return null;
    }
  }

  /**
   * Updates the current step in the processing state
   * @param issueId - The issue ID
   * @param currentStep - The current processing step
   * @param completedStep - The step that was just completed (optional)
   */
  updateStep(issueId: number, currentStep: ProcessingStep, completedStep?: ProcessingStep): void {
    const state = this.loadState(issueId);
    if (!state) {
      logger.warn(`No processing state found for issue #${issueId} to update`);
      return;
    }

    state.currentStep = currentStep;
    
    if (completedStep && !state.completedSteps.includes(completedStep)) {
      state.completedSteps.push(completedStep);
    }

    this.saveState(state);
  }

  /**
   * Creates initial processing state for an issue
   * @param issueId - The issue ID
   * @param branchName - The branch name for this issue
   * @param baseBranch - The base branch
   * @returns The initial processing state
   */
  createInitialState(issueId: number, branchName: string, baseBranch: string): ProcessingState {
    const state: ProcessingState = {
      issueId,
      branchName,
      baseBranch,
      currentStep: ProcessingStep.BRANCH_CREATION,
      completedSteps: [],
      lastUpdated: new Date(),
      retryCount: 0
    };

    this.saveState(state);
    return state;
  }

  /**
   * Removes the processing state for an issue (called on completion or final failure)
   * @param issueId - The issue ID to clean up
   */
  cleanupState(issueId: number): void {
    try {
      const stateFile = this.getStateFilePath(issueId);
      
      if (fs.existsSync(stateFile)) {
        fs.unlinkSync(stateFile);
        logger.info(`Cleaned up processing state for issue #${issueId}`);
      }
    } catch (error) {
      logger.warn(`Failed to cleanup processing state for issue #${issueId}:`, error);
    }
  }

  /**
   * Increments the retry count for an issue
   * @param issueId - The issue ID
   */
  incrementRetryCount(issueId: number): void {
    const state = this.loadState(issueId);
    if (state) {
      state.retryCount++;
      this.saveState(state);
    }
  }

  /**
   * Gets all issues that have pending processing states
   * @returns Array of issue IDs with pending states
   */
  getPendingIssues(): number[] {
    try {
      if (!fs.existsSync(this.stateDirectory)) {
        return [];
      }

      const files = fs.readdirSync(this.stateDirectory);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => parseInt(file.replace('.json', ''), 10))
        .filter(id => !isNaN(id));
    } catch (error) {
      logger.warn('Failed to get pending issues:', error);
      return [];
    }
  }

  /**
   * Ensures the state directory exists
   * @private
   */
  private ensureStateDirectory(): void {
    try {
      if (!fs.existsSync(this.stateDirectory)) {
        fs.mkdirSync(this.stateDirectory, { recursive: true });
      }
    } catch (error) {
      logger.warn(`Failed to create state directory ${this.stateDirectory}:`, error);
    }
  }

  /**
   * Gets the file path for an issue's state
   * @private
   * @param issueId - The issue ID
   * @returns The file path for the state file
   */
  private getStateFilePath(issueId: number): string {
    return path.join(this.stateDirectory, `${issueId}.json`);
  }
}