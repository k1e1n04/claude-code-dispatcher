import { ClaudeCodeDispatcher } from '../src/dispatcher';
import { GitHubClient } from '../src/github-client';
import { IssueQueue } from '../src/issue-queue';
import { IssuePoller } from '../src/poller';
import { ClaudeCodeProcessor } from '../src/claude-code-processor';
import { RetryHandler } from '../src/logger';
import { DispatcherConfig, GitHubIssue } from '../src/types';

describe('Core Functionality Tests', () => {
  describe('RetryHandler', () => {
    test('should execute operation successfully on first try', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await RetryHandler.withRetry(mockOperation, 3, 100, 'test');
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    test('should retry failed operations', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce('success on second try');
      
      const result = await RetryHandler.withRetry(mockOperation, 3, 10, 'test');
      
      expect(result).toBe('success on second try');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    test('should fail after max retries', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(
        RetryHandler.withRetry(mockOperation, 2, 10, 'test')
      ).rejects.toThrow('Always fails');
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Component Instantiation', () => {
    test('should create dispatcher with all components', () => {
      const config: DispatcherConfig = {
        owner: 'test',
        repo: 'test',
        assignee: 'test',
        baseBranch: 'main',
        pollInterval: 60,
        maxRetries: 3
      };

      expect(() => {
        new ClaudeCodeDispatcher(config);
      }).not.toThrow();
    });

    test('should create individual components', () => {
      expect(() => {
        new GitHubClient();
        new IssueQueue();
        new ClaudeCodeProcessor();
      }).not.toThrow();
    });
  });

  describe('Data Structures', () => {
    test('should handle issue validation', () => {
      const mockIssue: GitHubIssue = {
        id: 1,
        number: 123,
        title: 'Test Issue',
        body: 'Test body',
        state: 'open',
        assignee: { login: 'testuser' },
        repository: {
          owner: { login: 'testorg' },
          name: 'testrepo'
        },
        html_url: 'https://github.com/testorg/testrepo/issues/123',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      };

      expect(mockIssue.id).toBe(1);
      expect(mockIssue.number).toBe(123);
      expect(mockIssue.title).toBe('Test Issue');
    });
  });
});