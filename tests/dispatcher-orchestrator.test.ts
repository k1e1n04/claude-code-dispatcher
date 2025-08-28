import { DispatcherOrchestrator } from '../src/services/dispatcher-orchestrator';
import { ServiceContainer } from '../src/services/service-container';
import { PrerequisitesValidator } from '../src/services/prerequisites-validator';
import { IssuePoller } from '../src/services/poller';
import { ProcessingManager } from '../src/services/processing-manager';
import { StatusMonitor } from '../src/services/status-monitor';
import { DispatcherConfig } from '../src/types';

jest.mock('../src/services/service-container');
jest.mock('../src/services/prerequisites-validator');
jest.mock('../src/services/poller');
jest.mock('../src/services/processing-manager');
jest.mock('../src/services/status-monitor');

describe('DispatcherOrchestrator', () => {
  let orchestrator: DispatcherOrchestrator;
  let config: DispatcherConfig;
  let mockServiceContainer: jest.Mocked<ServiceContainer>;
  let mockPrerequisitesValidator: jest.Mocked<PrerequisitesValidator>;
  let mockPoller: jest.Mocked<IssuePoller>;
  let mockProcessingManager: jest.Mocked<ProcessingManager>;
  let mockStatusMonitor: jest.Mocked<StatusMonitor>;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      owner: 'testorg',
      repo: 'testrepo',
      assignee: 'testuser',
      baseBranch: 'main',
      pollInterval: 60,
      maxRetries: 3,
      allowedTools: ['Edit', 'Write']
    };

    // Mock service container and its methods
    mockServiceContainer = new ServiceContainer(config) as jest.Mocked<ServiceContainer>;
    mockPrerequisitesValidator = new PrerequisitesValidator(config) as jest.Mocked<PrerequisitesValidator>;
    mockPoller = new IssuePoller(null as any, null as any, config) as jest.Mocked<IssuePoller>;
    mockProcessingManager = {
      start: jest.fn(),
      stop: jest.fn(),
      isProcessing: jest.fn().mockReturnValue(false),
      processIssue: jest.fn()
    } as any;
    mockStatusMonitor = new StatusMonitor(mockPoller, null as any, mockProcessingManager) as jest.Mocked<StatusMonitor>;

    mockServiceContainer.getPrerequisitesValidator.mockReturnValue(mockPrerequisitesValidator);
    mockServiceContainer.createIssuePoller.mockReturnValue(mockPoller);
    mockServiceContainer.createProcessingManager.mockReturnValue(mockProcessingManager);
    mockServiceContainer.createStatusMonitor.mockReturnValue(mockStatusMonitor);

    // Mock ServiceContainer constructor
    (ServiceContainer as jest.MockedClass<typeof ServiceContainer>).mockImplementation(() => mockServiceContainer);

    orchestrator = new DispatcherOrchestrator(config, '/test/workspace');
  });

  describe('constructor', () => {
    test('should create orchestrator with config', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator).toBeInstanceOf(DispatcherOrchestrator);
    });

    test('should initialize service container with config and working directory', () => {
      expect(ServiceContainer).toHaveBeenCalledWith(config, '/test/workspace');
    });

    test('should get prerequisites validator from service container', () => {
      expect(mockServiceContainer.getPrerequisitesValidator).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    beforeEach(() => {
      mockPrerequisitesValidator.validate.mockResolvedValue();
      mockPoller.start.mockResolvedValue();
      mockProcessingManager.start.mockReturnValue();
      mockStatusMonitor.startMonitoring.mockReturnValue();
    });

    test('should start orchestrator successfully', async () => {
      await orchestrator.start();

      expect(orchestrator.isActive()).toBe(true);
      expect(mockPrerequisitesValidator.validate).toHaveBeenCalled();
      expect(mockPoller.start).toHaveBeenCalled();
      expect(mockProcessingManager.start).toHaveBeenCalled();
      expect(mockStatusMonitor.startMonitoring).toHaveBeenCalled();
    });

    test('should not start if already running', async () => {
      await orchestrator.start();
      await orchestrator.start(); // Second call should be ignored

      expect(mockPrerequisitesValidator.validate).toHaveBeenCalledTimes(1);
    });

    test('should validate prerequisites before starting', async () => {
      await orchestrator.start();

      expect(mockPrerequisitesValidator.validate).toHaveBeenCalled();
      expect(mockPoller.start).toHaveBeenCalled();
    });

    test('should create components in correct order', async () => {
      await orchestrator.start();

      expect(mockServiceContainer.createIssuePoller).toHaveBeenCalled();
      expect(mockServiceContainer.createProcessingManager).toHaveBeenCalled();
      expect(mockServiceContainer.createStatusMonitor).toHaveBeenCalledWith(
        mockPoller,
        mockProcessingManager
      );
    });

    test('should handle prerequisites validation failure', async () => {
      const error = new Error('Prerequisites validation failed');
      mockPrerequisitesValidator.validate.mockRejectedValue(error);

      await expect(orchestrator.start()).rejects.toThrow('Prerequisites validation failed');
      expect(orchestrator.isActive()).toBe(false);
    });

    test('should handle poller start failure', async () => {
      const error = new Error('Poller failed to start');
      mockPoller.start.mockRejectedValue(error);

      await expect(orchestrator.start()).rejects.toThrow('Poller failed to start');
      expect(orchestrator.isActive()).toBe(false);
    });

    test('should stop on startup failure', async () => {
      const error = new Error('Startup failed');
      mockPoller.start.mockRejectedValue(error);

      await expect(orchestrator.start()).rejects.toThrow('Startup failed');
      
      // Should have attempted to stop
      expect(mockStatusMonitor.stopMonitoring).toHaveBeenCalled();
      expect(mockProcessingManager.stop).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      mockPrerequisitesValidator.validate.mockResolvedValue();
      mockPoller.start.mockResolvedValue();
      mockProcessingManager.start.mockReturnValue();
      mockStatusMonitor.startMonitoring.mockReturnValue();
      
      mockStatusMonitor.stopMonitoring.mockReturnValue();
      mockProcessingManager.stop.mockReturnValue();
      mockPoller.stop.mockReturnValue();

      await orchestrator.start();
    });

    test('should stop orchestrator successfully', async () => {
      await orchestrator.stop();

      expect(orchestrator.isActive()).toBe(false);
      expect(mockStatusMonitor.stopMonitoring).toHaveBeenCalled();
      expect(mockProcessingManager.stop).toHaveBeenCalled();
      expect(mockPoller.stop).toHaveBeenCalled();
    });

    test('should not stop if not running', async () => {
      await orchestrator.stop();
      await orchestrator.stop(); // Second call should be ignored

      expect(mockStatusMonitor.stopMonitoring).toHaveBeenCalledTimes(1);
    });

    test('should stop components in reverse order', async () => {
      await orchestrator.stop();

      expect(mockStatusMonitor.stopMonitoring).toHaveBeenCalled();
      expect(mockProcessingManager.stop).toHaveBeenCalled();
      expect(mockPoller.stop).toHaveBeenCalled();
    });

    test('should handle stop when components are undefined', async () => {
      const freshOrchestrator = new DispatcherOrchestrator(config);
      
      // Should not throw when stopping before starting
      await expect(freshOrchestrator.stop()).resolves.toBeUndefined();
    });
  });

  describe('getStatus', () => {
    test('should return default status when not started', () => {
      const status = orchestrator.getStatus();

      expect(status).toEqual({
        polling: false,
        processing: false,
        queueSize: 0,
      });
    });

    test('should delegate to status monitor when started', async () => {
      const mockStatus = {
        polling: true,
        processing: false,
        queueSize: 2,
        nextIssue: {
          id: 123,
          number: 456,
          title: 'Test Issue',
          body: 'Test description',
          state: 'open',
          assignee: { login: 'testuser' },
          repository: {
            owner: { login: 'testorg' },
            name: 'testrepo'
          },
          html_url: 'https://github.com/testorg/testrepo/issues/456',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        }
      };

      mockPrerequisitesValidator.validate.mockResolvedValue();
      mockPoller.start.mockResolvedValue();
      mockProcessingManager.start.mockReturnValue();
      mockStatusMonitor.startMonitoring.mockReturnValue();
      mockStatusMonitor.getStatus.mockReturnValue(mockStatus);

      await orchestrator.start();
      const status = orchestrator.getStatus();

      expect(status).toEqual(mockStatus);
      expect(mockStatusMonitor.getStatus).toHaveBeenCalled();
    });
  });

  describe('isActive', () => {
    test('should return false initially', () => {
      expect(orchestrator.isActive()).toBe(false);
    });

    test('should return true when started', async () => {
      mockPrerequisitesValidator.validate.mockResolvedValue();
      mockPoller.start.mockResolvedValue();
      mockProcessingManager.start.mockReturnValue();
      mockStatusMonitor.startMonitoring.mockReturnValue();

      await orchestrator.start();
      expect(orchestrator.isActive()).toBe(true);
    });

    test('should return false when stopped', async () => {
      mockPrerequisitesValidator.validate.mockResolvedValue();
      mockPoller.start.mockResolvedValue();
      mockProcessingManager.start.mockReturnValue();
      mockStatusMonitor.startMonitoring.mockReturnValue();
      mockStatusMonitor.stopMonitoring.mockReturnValue();
      mockProcessingManager.stop.mockReturnValue();
      mockPoller.stop.mockReturnValue();

      await orchestrator.start();
      await orchestrator.stop();
      expect(orchestrator.isActive()).toBe(false);
    });
  });

  describe('getServiceContainer', () => {
    test('should return the service container instance', () => {
      const container = orchestrator.getServiceContainer();
      expect(container).toBe(mockServiceContainer);
    });
  });

  describe('lifecycle management', () => {
    test('should handle start/stop cycling', async () => {
      mockPrerequisitesValidator.validate.mockResolvedValue();
      mockPoller.start.mockResolvedValue();
      mockProcessingManager.start.mockReturnValue();
      mockStatusMonitor.startMonitoring.mockReturnValue();
      mockStatusMonitor.stopMonitoring.mockReturnValue();
      mockProcessingManager.stop.mockReturnValue();
      mockPoller.stop.mockReturnValue();

      // Start -> Stop -> Start again
      await orchestrator.start();
      expect(orchestrator.isActive()).toBe(true);
      
      await orchestrator.stop();
      expect(orchestrator.isActive()).toBe(false);
      
      await orchestrator.start();
      expect(orchestrator.isActive()).toBe(true);
    });

    test('should handle errors during shutdown gracefully', async () => {
      mockPrerequisitesValidator.validate.mockResolvedValue();
      mockPoller.start.mockResolvedValue();
      mockProcessingManager.start.mockReturnValue();
      mockStatusMonitor.startMonitoring.mockReturnValue();

      await orchestrator.start();

      // Mock error during stop
      mockStatusMonitor.stopMonitoring.mockImplementation(() => {
        throw new Error('Stop error');
      });

      // Should not throw - errors during stop should be handled gracefully
      await expect(orchestrator.stop()).resolves.toBeUndefined();
      expect(orchestrator.isActive()).toBe(false);
    });
  });
});