import { ServiceContainer } from '../src/services/service-container';
import { DispatcherConfig } from '../src/types';
import { GitHubClient } from '../src/clients';
import { IssueQueue } from '../src/services/issue-queue';
import { IssuePoller } from '../src/services/poller';

jest.mock('../src/clients');
jest.mock('../src/services/issue-queue');
jest.mock('../src/services/poller');

describe('ServiceContainer', () => {
  let config: DispatcherConfig;
  let serviceContainer: ServiceContainer;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      owner: 'testorg',
      repo: 'testrepo',
      assignee: 'testuser',
      baseBranch: 'main',
      pollInterval: 60,
      maxRetries: 3,
      allowedTools: ['Edit', 'Write'],
      rateLimitRetryDelay: 5000
    };

    serviceContainer = new ServiceContainer(config, '/test/workspace');
  });

  describe('constructor', () => {
    test('should create service container with config', () => {
      expect(serviceContainer).toBeDefined();
      expect(serviceContainer).toBeInstanceOf(ServiceContainer);
    });

    test('should store config and working directory', () => {
      expect(serviceContainer.getConfig()).toEqual(config);
      expect(serviceContainer.getWorkingDirectory()).toBe('/test/workspace');
    });

    test('should handle undefined working directory', () => {
      const container = new ServiceContainer(config);
      expect(container.getWorkingDirectory()).toBeUndefined();
    });
  });

  describe('singleton services', () => {
    test('should return same GitHubClient instance on multiple calls', () => {
      const client1 = serviceContainer.getGitHubClient();
      const client2 = serviceContainer.getGitHubClient();
      
      expect(client1).toBe(client2);
      expect(GitHubClient).toHaveBeenCalledTimes(1);
    });

    test('should return same IssueQueue instance on multiple calls', () => {
      const queue1 = serviceContainer.getIssueQueue();
      const queue2 = serviceContainer.getIssueQueue();
      
      expect(queue1).toBe(queue2);
      expect(IssueQueue).toHaveBeenCalledTimes(1);
    });

    test('should return same PrerequisitesValidator instance on multiple calls', () => {
      const validator1 = serviceContainer.getPrerequisitesValidator();
      const validator2 = serviceContainer.getPrerequisitesValidator();
      
      expect(validator1).toBe(validator2);
    });

    test('should return same RateLimitHandler instance on multiple calls', () => {
      const handler1 = serviceContainer.getRateLimitHandler();
      const handler2 = serviceContainer.getRateLimitHandler();
      
      expect(handler1).toBe(handler2);
    });
  });

  describe('factory methods', () => {
    test('should create new IssuePoller instances', () => {
      const poller1 = serviceContainer.createIssuePoller();
      const poller2 = serviceContainer.createIssuePoller();
      
      expect(poller1).not.toBe(poller2);
      expect(IssuePoller).toHaveBeenCalledTimes(2);
    });

    test('should create IssuePoller with correct dependencies', () => {
      const githubClient = serviceContainer.getGitHubClient();
      const issueQueue = serviceContainer.getIssueQueue();
      
      serviceContainer.createIssuePoller();
      
      expect(IssuePoller).toHaveBeenCalledWith(githubClient, issueQueue, config);
    });

    test('should create new ResumableIssueProcessor instances', () => {
      const processor1 = serviceContainer.createResumableIssueProcessor();
      const processor2 = serviceContainer.createResumableIssueProcessor();
      
      expect(processor1).not.toBe(processor2);
    });

    test('should create new ProcessingManager instances', () => {
      const manager1 = serviceContainer.createProcessingManager();
      const manager2 = serviceContainer.createProcessingManager();
      
      expect(manager1).not.toBe(manager2);
    });

    test('should create new StatusMonitor instances', () => {
      const mockPoller = serviceContainer.createIssuePoller();
      const mockProcessingManager = serviceContainer.createProcessingManager();
      
      const monitor1 = serviceContainer.createStatusMonitor(mockPoller, mockProcessingManager);
      const monitor2 = serviceContainer.createStatusMonitor(mockPoller, mockProcessingManager);
      
      expect(monitor1).not.toBe(monitor2);
    });
  });

  describe('configuration access', () => {
    test('should return original config', () => {
      const returnedConfig = serviceContainer.getConfig();
      expect(returnedConfig).toEqual(config);
      expect(returnedConfig).toBe(config); // Same reference
    });

    test('should return working directory', () => {
      expect(serviceContainer.getWorkingDirectory()).toBe('/test/workspace');
    });
  });

  describe('reset functionality', () => {
    test('should reset all singleton instances', () => {
      // Create some singletons
      const client1 = serviceContainer.getGitHubClient();
      const queue1 = serviceContainer.getIssueQueue();
      const validator1 = serviceContainer.getPrerequisitesValidator();
      
      // Reset the container
      serviceContainer.reset();
      
      // Get new instances
      const client2 = serviceContainer.getGitHubClient();
      const queue2 = serviceContainer.getIssueQueue();
      const validator2 = serviceContainer.getPrerequisitesValidator();
      
      // Should be different instances
      expect(client1).not.toBe(client2);
      expect(queue1).not.toBe(queue2);
      expect(validator1).not.toBe(validator2);
    });

    test('should allow creating fresh instances after reset', () => {
      serviceContainer.getGitHubClient(); // Create first instance
      serviceContainer.reset();
      
      const client = serviceContainer.getGitHubClient(); // Create fresh instance
      expect(client).toBeDefined();
    });
  });

  describe('dependency injection', () => {
    test('should provide correct dependencies to ProcessingManager', () => {
      const processingManager = serviceContainer.createProcessingManager();
      expect(processingManager).toBeDefined();
    });

    test('should provide correct dependencies to StatusMonitor', () => {
      const poller = serviceContainer.createIssuePoller();
      const processingManager = serviceContainer.createProcessingManager();
      
      const statusMonitor = serviceContainer.createStatusMonitor(poller, processingManager);
      expect(statusMonitor).toBeDefined();
    });

    test('should reuse singleton dependencies across factory methods', () => {
      const githubClient1 = serviceContainer.getGitHubClient();
      
      // Create a poller which should use the same GitHub client
      serviceContainer.createIssuePoller();
      
      const githubClient2 = serviceContainer.getGitHubClient();
      expect(githubClient1).toBe(githubClient2);
    });
  });

  describe('configuration handling', () => {
    test('should handle config with all optional properties', () => {
      const fullConfig: DispatcherConfig = {
        owner: 'testorg',
        repo: 'testrepo',
        assignee: 'testuser',
        baseBranch: 'main',
        pollInterval: 60,
        maxRetries: 3,
        allowedTools: ['Edit', 'Write'],
        disallowedTools: ['Bash'],
        dangerouslySkipPermissions: true,
        rateLimitRetryDelay: 10000
      };

      const container = new ServiceContainer(fullConfig, '/test');
      expect(container.getConfig()).toEqual(fullConfig);
    });

    test('should handle config with minimal required properties', () => {
      const minimalConfig: DispatcherConfig = {
        owner: 'testorg',
        repo: 'testrepo',
        assignee: 'testuser',
        baseBranch: 'main',
        pollInterval: 60,
        maxRetries: 3
      };

      const container = new ServiceContainer(minimalConfig);
      expect(container.getConfig()).toEqual(minimalConfig);
    });
  });
});