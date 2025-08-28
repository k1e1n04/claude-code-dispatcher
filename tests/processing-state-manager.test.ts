import { ProcessingStateManager } from '../src/services/processing-state-manager';
import { ProcessingStep } from '../src/types/index';
import * as fs from 'fs';
import * as path from 'path';

describe('ProcessingStateManager', () => {
  let stateManager: ProcessingStateManager;
  let testStateDir: string;

  beforeEach(() => {
    testStateDir = path.join(__dirname, '.test-claude-state');
    stateManager = new ProcessingStateManager(testStateDir);
  });

  afterEach(() => {
    // Cleanup test state directory
    if (fs.existsSync(testStateDir)) {
      fs.rmSync(testStateDir, { recursive: true });
    }
  });

  describe('state persistence', () => {
    test('should create initial state for an issue', () => {
      const state = stateManager.createInitialState(123, 'issue-123-test', 'main');

      expect(state.issueId).toBe(123);
      expect(state.branchName).toBe('issue-123-test');
      expect(state.baseBranch).toBe('main');
      expect(state.currentStep).toBe(ProcessingStep.BRANCH_CREATION);
      expect(state.completedSteps).toEqual([]);
      expect(state.retryCount).toBe(0);
      expect(state.lastUpdated).toBeInstanceOf(Date);
    });

    test('should save and load processing state', () => {
      const originalState = stateManager.createInitialState(456, 'issue-456-test', 'develop');
      
      const loadedState = stateManager.loadState(456);
      
      expect(loadedState).not.toBeNull();
      expect(loadedState!.issueId).toBe(456);
      expect(loadedState!.branchName).toBe('issue-456-test');
      expect(loadedState!.baseBranch).toBe('develop');
      expect(loadedState!.currentStep).toBe(ProcessingStep.BRANCH_CREATION);
    });

    test('should return null for non-existent state', () => {
      const state = stateManager.loadState(999);
      expect(state).toBeNull();
    });

    test('should update processing step', () => {
      stateManager.createInitialState(789, 'issue-789-test', 'main');
      
      stateManager.updateStep(789, ProcessingStep.IMPLEMENTATION, ProcessingStep.BRANCH_CREATION);
      
      const updatedState = stateManager.loadState(789);
      expect(updatedState!.currentStep).toBe(ProcessingStep.IMPLEMENTATION);
      expect(updatedState!.completedSteps).toContain(ProcessingStep.BRANCH_CREATION);
    });

    test('should increment retry count', () => {
      stateManager.createInitialState(101, 'issue-101-test', 'main');
      
      stateManager.incrementRetryCount(101);
      stateManager.incrementRetryCount(101);
      
      const state = stateManager.loadState(101);
      expect(state!.retryCount).toBe(2);
    });

    test('should cleanup state', () => {
      stateManager.createInitialState(202, 'issue-202-test', 'main');
      expect(stateManager.loadState(202)).not.toBeNull();
      
      stateManager.cleanupState(202);
      expect(stateManager.loadState(202)).toBeNull();
    });

    test('should get pending issues', () => {
      stateManager.createInitialState(301, 'issue-301-test', 'main');
      stateManager.createInitialState(302, 'issue-302-test', 'main');
      stateManager.createInitialState(303, 'issue-303-test', 'main');
      
      const pendingIssues = stateManager.getPendingIssues();
      expect(pendingIssues).toHaveLength(3);
      expect(pendingIssues).toContain(301);
      expect(pendingIssues).toContain(302);
      expect(pendingIssues).toContain(303);
    });
  });

  describe('error handling', () => {
    test('should handle save errors gracefully', () => {
      // Create a read-only directory to trigger save error
      const readOnlyDir = path.join(__dirname, '.readonly-state');
      fs.mkdirSync(readOnlyDir);
      fs.chmodSync(readOnlyDir, 0o444);
      
      const readOnlyManager = new ProcessingStateManager(readOnlyDir);
      
      // Should not throw
      expect(() => {
        readOnlyManager.createInitialState(404, 'issue-404-test', 'main');
      }).not.toThrow();
      
      // Cleanup
      fs.chmodSync(readOnlyDir, 0o755);
      fs.rmSync(readOnlyDir, { recursive: true });
    });

    test('should handle load errors gracefully', () => {
      // Create corrupted state file
      const corruptedFile = path.join(testStateDir, '505.json');
      fs.writeFileSync(corruptedFile, 'invalid json content');
      
      const state = stateManager.loadState(505);
      expect(state).toBeNull();
    });

    test('should handle missing state directory for getPendingIssues', () => {
      const nonExistentManager = new ProcessingStateManager('/non/existent/path');
      const pendingIssues = nonExistentManager.getPendingIssues();
      expect(pendingIssues).toEqual([]);
    });
  });
});
