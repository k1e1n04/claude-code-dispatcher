/**
 * Basic Integration Tests
 * Simple tests that avoid logger dependencies
 */

import { ProcessingStep } from '../../src/types/index';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

// Simple ProcessingStateManager without logger
class SimpleStateManager {
  private stateDirectory: string;

  constructor(stateDirectory: string = '.claude-state') {
    this.stateDirectory = stateDirectory;
    this.ensureStateDirectory();
  }

  private ensureStateDirectory(): void {
    const fs = require('fs');
    if (!fs.existsSync(this.stateDirectory)) {
      fs.mkdirSync(this.stateDirectory, { recursive: true });
    }
  }

  private getStateFilePath(issueId: number): string {
    return join(this.stateDirectory, `${issueId}.json`);
  }

  createInitialState(issueId: number, branchName: string, baseBranch: string) {
    return {
      issueId,
      branchName,
      baseBranch,
      currentStep: ProcessingStep.BRANCH_CREATION,
      retryCount: 0,
      lastUpdated: new Date().toISOString()
    };
  }

  saveState(state: any): void {
    const fs = require('fs');
    const stateFile = this.getStateFilePath(state.issueId);
    const stateData = {
      ...state,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(stateFile, JSON.stringify(stateData, null, 2), 'utf8');
  }

  async loadState(issueId: number) {
    try {
      const fs = require('fs');
      const stateFile = this.getStateFilePath(issueId);
      
      if (!fs.existsSync(stateFile)) {
        return null;
      }

      const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      return stateData;
    } catch {
      return null;
    }
  }

  updateStep(issueId: number, step: ProcessingStep): void {
    try {
      const fs = require('fs');
      const stateFile = this.getStateFilePath(issueId);
      
      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        state.currentStep = step;
        state.lastUpdated = new Date().toISOString();
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
      }
    } catch {
      // Ignore errors
    }
  }

  incrementRetryCount(issueId: number): void {
    try {
      const fs = require('fs');
      const stateFile = this.getStateFilePath(issueId);
      
      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        state.retryCount = (state.retryCount || 0) + 1;
        state.lastUpdated = new Date().toISOString();
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
      }
    } catch {
      // Ignore errors
    }
  }

  cleanupState(issueId: number): void {
    try {
      const fs = require('fs');
      const stateFile = this.getStateFilePath(issueId);
      
      if (fs.existsSync(stateFile)) {
        fs.unlinkSync(stateFile);
      }
    } catch {
      // Ignore errors
    }
  }
}

describe('Basic Integration Tests', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(join(tmpdir(), 'basic-integration-test-'));
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('State Management', () => {
    test('should create and manage state files', async () => {
      const stateManager = new SimpleStateManager();
      const mockIssue = { id: 123, number: 123 };
      
      // Create initial state
      const branchName = 'issue-123-test';
      const state = stateManager.createInitialState(mockIssue.id, branchName, 'main');
      stateManager.saveState(state);

      // Verify state file exists
      const stateDir = join(process.cwd(), '.claude-state');
      const exists = await fs.access(stateDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Load state
      const loadedState = await stateManager.loadState(mockIssue.id);
      expect(loadedState).not.toBeNull();
      expect(loadedState?.issueId).toBe(123);
      expect(loadedState?.branchName).toBe(branchName);
      expect(loadedState?.currentStep).toBe(ProcessingStep.BRANCH_CREATION);

      // Update step
      stateManager.updateStep(mockIssue.id, ProcessingStep.IMPLEMENTATION);
      const updatedState = await stateManager.loadState(mockIssue.id);
      expect(updatedState?.currentStep).toBe(ProcessingStep.IMPLEMENTATION);

      // Cleanup
      stateManager.cleanupState(mockIssue.id);
      const stateFile = join(stateDir, '123.json');
      const stateFileExists = await fs.access(stateFile).then(() => true).catch(() => false);
      expect(stateFileExists).toBe(false);
    });

    test('should handle retry count increment', async () => {
      const stateManager = new SimpleStateManager();
      const mockIssue = { id: 456, number: 456 };
      
      const branchName = 'issue-456-retry-test';
      const state = stateManager.createInitialState(mockIssue.id, branchName, 'main');
      stateManager.saveState(state);

      // Increment retry count
      stateManager.incrementRetryCount(mockIssue.id);
      const updatedState = await stateManager.loadState(mockIssue.id);
      expect(updatedState?.retryCount).toBe(1);

      // Increment again
      stateManager.incrementRetryCount(mockIssue.id);
      const finalState = await stateManager.loadState(mockIssue.id);
      expect(finalState?.retryCount).toBe(2);

      // Cleanup
      stateManager.cleanupState(mockIssue.id);
    });
  });

  describe('Processing Step Enum', () => {
    test('should have all expected processing steps', () => {
      const steps = Object.values(ProcessingStep);
      expect(steps).toContain(ProcessingStep.BRANCH_CREATION);
      expect(steps).toContain(ProcessingStep.IMPLEMENTATION);
      expect(steps).toContain(ProcessingStep.CHANGE_DETECTION);
      expect(steps).toContain(ProcessingStep.COMMIT_PUSH);
      expect(steps).toContain(ProcessingStep.PR_CREATION);
      expect(steps).toContain(ProcessingStep.COMPLETED);
    });

    test('should support step transitions', async () => {
      const stateManager = new SimpleStateManager();
      const state = stateManager.createInitialState(123, 'test', 'main');
      
      // Initial step should be BRANCH_CREATION
      expect(state.currentStep).toBe(ProcessingStep.BRANCH_CREATION);
      
      stateManager.saveState(state);

      // Test step progression
      const steps = [
        ProcessingStep.IMPLEMENTATION,
        ProcessingStep.CHANGE_DETECTION,
        ProcessingStep.COMMIT_PUSH,
        ProcessingStep.PR_CREATION,
        ProcessingStep.COMPLETED
      ];

      for (const step of steps) {
        stateManager.updateStep(123, step);
        const updatedState = await stateManager.loadState(123);
        expect(updatedState?.currentStep).toBe(step);
      }

      stateManager.cleanupState(123);
    });
  });

  describe('File System Operations', () => {
    test('should handle directory creation and cleanup', async () => {
      const stateDir = join(testDir, '.claude-state');
      
      // Initially no directory
      let exists = await fs.access(stateDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);

      // Create state manager (should create directory)
      const stateManager = new SimpleStateManager();
      const state = stateManager.createInitialState(999, 'test-branch', 'main');
      stateManager.saveState(state);

      // Directory should exist
      exists = await fs.access(stateDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Should contain state file
      const files = await fs.readdir(stateDir);
      expect(files).toContain('999.json');

      // Cleanup
      stateManager.cleanupState(999);
      const finalFiles = await fs.readdir(stateDir);
      expect(finalFiles).not.toContain('999.json');
    });

    test('should handle missing state files gracefully', async () => {
      const stateManager = new SimpleStateManager();
      
      // Try to load non-existent state
      const state = await stateManager.loadState(999);
      expect(state).toBeNull();

      // Try to update non-existent state (should not throw)
      expect(() => {
        stateManager.updateStep(999, ProcessingStep.IMPLEMENTATION);
      }).not.toThrow();

      // Try to cleanup non-existent state (should not throw)
      expect(() => {
        stateManager.cleanupState(999);
      }).not.toThrow();
    });
  });
});