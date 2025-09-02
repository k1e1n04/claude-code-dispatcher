/**
 * File System Integration Tests
 * Test basic file system operations without any logger dependencies
 */

import { ProcessingStep } from '../../src/types/index';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('File System Integration Tests', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(join(tmpdir(), 'fs-integration-test-'));
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('State File Operations', () => {
    test('should create and manage state files manually', async () => {
      const stateDir = join(testDir, '.claude-state');
      
      // Create state directory
      await fs.mkdir(stateDir, { recursive: true });
      expect(await fs.access(stateDir).then(() => true).catch(() => false)).toBe(true);

      // Create state file
      const stateFile = join(stateDir, '123.json');
      const stateData = {
        issueId: 123,
        branchName: 'issue-123-test',
        baseBranch: 'main',
        currentStep: ProcessingStep.BRANCH_CREATION,
        retryCount: 0,
        lastUpdated: new Date().toISOString()
      };

      await fs.writeFile(stateFile, JSON.stringify(stateData, null, 2));
      expect(await fs.access(stateFile).then(() => true).catch(() => false)).toBe(true);

      // Read and verify state file
      const savedData = JSON.parse(await fs.readFile(stateFile, 'utf8'));
      expect(savedData.issueId).toBe(123);
      expect(savedData.branchName).toBe('issue-123-test');
      expect(savedData.currentStep).toBe(ProcessingStep.BRANCH_CREATION);

      // Update state file
      savedData.currentStep = ProcessingStep.IMPLEMENTATION;
      savedData.retryCount = 1;
      await fs.writeFile(stateFile, JSON.stringify(savedData, null, 2));

      // Verify update
      const updatedData = JSON.parse(await fs.readFile(stateFile, 'utf8'));
      expect(updatedData.currentStep).toBe(ProcessingStep.IMPLEMENTATION);
      expect(updatedData.retryCount).toBe(1);

      // Delete state file
      await fs.unlink(stateFile);
      expect(await fs.access(stateFile).then(() => true).catch(() => false)).toBe(false);
    });

    test('should handle multiple state files', async () => {
      const stateDir = join(testDir, '.claude-state');
      await fs.mkdir(stateDir, { recursive: true });

      // Create multiple state files
      const issues = [123, 456, 789];
      const stateFiles = [];

      for (const issueId of issues) {
        const stateFile = join(stateDir, `${issueId}.json`);
        const stateData = {
          issueId,
          branchName: `issue-${issueId}-test`,
          baseBranch: 'main',
          currentStep: ProcessingStep.BRANCH_CREATION,
          retryCount: 0,
          lastUpdated: new Date().toISOString()
        };

        await fs.writeFile(stateFile, JSON.stringify(stateData, null, 2));
        stateFiles.push(stateFile);
      }

      // Verify all files exist
      for (const stateFile of stateFiles) {
        expect(await fs.access(stateFile).then(() => true).catch(() => false)).toBe(true);
      }

      // List files in directory
      const files = await fs.readdir(stateDir);
      expect(files).toHaveLength(3);
      expect(files).toContain('123.json');
      expect(files).toContain('456.json');
      expect(files).toContain('789.json');

      // Cleanup all files
      for (const stateFile of stateFiles) {
        await fs.unlink(stateFile);
      }

      const finalFiles = await fs.readdir(stateDir);
      expect(finalFiles).toHaveLength(0);
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
      
      // Should have exactly 6 steps
      expect(steps).toHaveLength(6);
    });

    test('should have correct step values', () => {
      expect(ProcessingStep.BRANCH_CREATION).toBe('branch_creation');
      expect(ProcessingStep.IMPLEMENTATION).toBe('implementation');
      expect(ProcessingStep.CHANGE_DETECTION).toBe('change_detection');
      expect(ProcessingStep.COMMIT_PUSH).toBe('commit_push');
      expect(ProcessingStep.PR_CREATION).toBe('pr_creation');
      expect(ProcessingStep.COMPLETED).toBe('completed');
    });

    test('should support step transitions in state files', async () => {
      const stateDir = join(testDir, '.claude-state');
      await fs.mkdir(stateDir, { recursive: true });
      
      const stateFile = join(stateDir, 'transition-test.json');
      const stateData = {
        issueId: 999,
        branchName: 'issue-999-transition-test',
        baseBranch: 'main',
        currentStep: ProcessingStep.BRANCH_CREATION,
        retryCount: 0,
        lastUpdated: new Date().toISOString()
      };

      // Test step progression
      const steps = [
        ProcessingStep.BRANCH_CREATION,
        ProcessingStep.IMPLEMENTATION,
        ProcessingStep.CHANGE_DETECTION,
        ProcessingStep.COMMIT_PUSH,
        ProcessingStep.PR_CREATION,
        ProcessingStep.COMPLETED
      ];

      for (const step of steps) {
        const updatedStateData = {
          ...stateData,
          currentStep: step,
          lastUpdated: new Date().toISOString()
        };
        
        await fs.writeFile(stateFile, JSON.stringify(updatedStateData, null, 2));
        
        // Verify the step was saved correctly
        const savedData = JSON.parse(await fs.readFile(stateFile, 'utf8'));
        expect(savedData.currentStep).toBe(step);
      }

      await fs.unlink(stateFile);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing files gracefully', async () => {
      const nonExistentFile = join(testDir, 'non-existent.json');
      
      // Reading non-existent file should throw
      await expect(fs.readFile(nonExistentFile, 'utf8')).rejects.toThrow();
      
      // Check if file exists should return false
      const exists = await fs.access(nonExistentFile).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    test('should handle directory creation', async () => {
      const nestedDir = join(testDir, 'nested', 'state', 'directory');
      
      // Should not exist initially
      let exists = await fs.access(nestedDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);
      
      // Create nested directory
      await fs.mkdir(nestedDir, { recursive: true });
      
      // Should exist now
      exists = await fs.access(nestedDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      // Should be able to create files in it
      const testFile = join(nestedDir, 'test.json');
      await fs.writeFile(testFile, JSON.stringify({ test: true }));
      
      const data = JSON.parse(await fs.readFile(testFile, 'utf8'));
      expect(data.test).toBe(true);
    });
  });

  describe('JSON Operations', () => {
    test('should handle complex state data', async () => {
      const stateFile = join(testDir, 'complex-state.json');
      
      const complexState = {
        issueId: 12345,
        branchName: 'issue-12345-add-complex-feature-with-long-name',
        baseBranch: 'develop',
        currentStep: ProcessingStep.IMPLEMENTATION,
        retryCount: 3,
        lastUpdated: new Date().toISOString(),
        metadata: {
          title: 'Add complex feature with special characters: <>?/\\|*"',
          body: 'This is a\nmultiline\ndescription with\ttabs and spaces',
          tags: ['enhancement', 'priority-high', 'needs-review'],
          assignee: 'test-user'
        },
        history: [
          { step: ProcessingStep.BRANCH_CREATION, timestamp: '2023-01-01T00:00:00Z' },
          { step: ProcessingStep.IMPLEMENTATION, timestamp: '2023-01-01T01:00:00Z' }
        ]
      };

      // Save complex state
      await fs.writeFile(stateFile, JSON.stringify(complexState, null, 2));
      
      // Read and verify
      const savedState = JSON.parse(await fs.readFile(stateFile, 'utf8'));
      
      expect(savedState.issueId).toBe(12345);
      expect(savedState.branchName).toBe('issue-12345-add-complex-feature-with-long-name');
      expect(savedState.metadata.title).toBe('Add complex feature with special characters: <>?/\\|*"');
      expect(savedState.metadata.tags).toEqual(['enhancement', 'priority-high', 'needs-review']);
      expect(savedState.history).toHaveLength(2);
      
      await fs.unlink(stateFile);
    });
  });
});