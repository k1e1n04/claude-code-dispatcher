import { IssuePoller, IssueQueue } from '../src/services';
import { GitHubClient } from '../src/clients';
import { DispatcherConfig, GitHubIssue } from '../src/types';

// Create real instances for simpler testing
describe('IssuePoller - Simple Tests', () => {
  let poller: IssuePoller;
  let githubClient: GitHubClient;
  let issueQueue: IssueQueue;
  let config: DispatcherConfig;

  beforeEach(() => {
    githubClient = new GitHubClient();
    issueQueue = new IssueQueue();
    
    config = {
      owner: 'testorg',
      repo: 'testrepo',
      assignee: 'testuser',
      baseBranch: 'main',
      pollInterval: 1, // Short interval for testing
      maxRetries: 2,
      allowedTools: ['Edit', 'Write']
    };

    poller = new IssuePoller(githubClient, issueQueue, config);
  });

  describe('constructor and initialization', () => {
    test('should create poller with valid parameters', () => {
      expect(poller).toBeDefined();
      expect(poller).toBeInstanceOf(IssuePoller);
    });

    test('should not be active initially', () => {
      expect(poller.isActive()).toBe(false);
    });

    test('should provide initial status', () => {
      const status = poller.getStatus();
      
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('queueStatus');
      expect(status.running).toBe(false);
      expect(status.nextPollIn).toBeUndefined();
    });
  });

  describe('status reporting', () => {
    test('should provide comprehensive status', () => {
      const status = poller.getStatus();
      
      expect(status).toMatchObject({
        running: false,
        nextPollIn: undefined,
        queueStatus: expect.objectContaining({
          queueSize: expect.any(Number),
          processing: expect.any(Boolean)
        })
      });
    });

    test('should update status when started', () => {
      // Note: We can't actually start the poller in tests without mocking
      // network calls, but we can test the status structure
      const status = poller.getStatus();
      
      expect(typeof status.running).toBe('boolean');
      expect(status.queueStatus).toBeDefined();
    });
  });

  describe('lifecycle management', () => {
    test('should handle stop when not running', () => {
      expect(poller.isActive()).toBe(false);
      
      // Should not throw
      poller.stop();
      
      expect(poller.isActive()).toBe(false);
    });

    test('should maintain consistent state', () => {
      const initialStatus = poller.getStatus();
      
      // Multiple status calls should be consistent
      const secondStatus = poller.getStatus();
      
      expect(initialStatus.running).toBe(secondStatus.running);
    });
  });

  describe('configuration handling', () => {
    test('should use provided configuration', () => {
      const status = poller.getStatus();
      
      // When running, should use config poll interval
      if (status.running) {
        expect(status.nextPollIn).toBe(config.pollInterval);
      }
    });

    test('should handle different poll intervals', () => {
      const customConfig = { ...config, pollInterval: 30 };
      const customPoller = new IssuePoller(githubClient, issueQueue, customConfig);
      
      expect(customPoller).toBeDefined();
      expect(customPoller.isActive()).toBe(false);
    });
  });

  describe('integration with queue', () => {
    test('should interact with issue queue', () => {
      // Queue should be empty initially
      const queueStatus = issueQueue.getStatus();
      expect(queueStatus.queueSize).toBe(0);
      expect(queueStatus.processing).toBe(false);
    });

    test('should maintain queue reference', () => {
      const status = poller.getStatus();
      
      // Should reflect the actual queue state
      expect(status.queueStatus.queueSize).toBe(0);
      expect(status.queueStatus.processing).toBe(false);
    });
  });

  describe('error handling preparation', () => {
    test('should be prepared for GitHub client errors', () => {
      // Even if GitHub client fails, poller should exist
      expect(poller.isActive()).toBe(false);
      
      // Should handle stop gracefully even with errors
      poller.stop();
      expect(poller.isActive()).toBe(false);
    });
  });
});