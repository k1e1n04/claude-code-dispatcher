import { StatusMonitor } from '../src/services/status-monitor';
import { IssuePoller } from '../src/services/poller';
import { IssueQueue } from '../src/services/issue-queue';
import { ProcessingManager } from '../src/services/processing-manager';

jest.mock('../src/services/poller');
jest.mock('../src/services/issue-queue');
jest.mock('../src/services/processing-manager');

describe('StatusMonitor', () => {
  let statusMonitor: StatusMonitor;
  let mockPoller: jest.Mocked<IssuePoller>;
  let mockIssueQueue: jest.Mocked<IssueQueue>;
  let mockProcessingManager: jest.Mocked<ProcessingManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockPoller = new IssuePoller(null as any, null as any, null as any) as jest.Mocked<IssuePoller>;
    mockIssueQueue = new IssueQueue() as jest.Mocked<IssueQueue>;
    mockProcessingManager = {} as jest.Mocked<ProcessingManager>;

    // Setup default mock implementations
    mockPoller.getStatus.mockReturnValue({ 
      running: false,
      queueStatus: {
        processing: false,
        queueSize: 0,
        nextIssue: undefined
      }
    });
    mockIssueQueue.getStatus.mockReturnValue({
      processing: false,
      queueSize: 0,
      nextIssue: undefined
    });

    statusMonitor = new StatusMonitor(mockPoller, mockIssueQueue, mockProcessingManager);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('should create status monitor instance', () => {
      expect(statusMonitor).toBeDefined();
      expect(statusMonitor).toBeInstanceOf(StatusMonitor);
    });
  });

  describe('startMonitoring', () => {
    test('should start monitoring successfully', () => {
      statusMonitor.startMonitoring();
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(true);
    });

    test('should not start monitoring if already running', () => {
      statusMonitor.startMonitoring();
      statusMonitor.startMonitoring(); // Second call should be ignored
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(true);
    });

    test('should set up periodic status logging', () => {
      statusMonitor.startMonitoring();
      
      // Fast-forward time to trigger the interval
      jest.advanceTimersByTime(30000);
      
      expect(mockPoller.getStatus).toHaveBeenCalled();
      expect(mockIssueQueue.getStatus).toHaveBeenCalled();
    });

    test('should continue monitoring on subsequent intervals', () => {
      statusMonitor.startMonitoring();
      
      // Advance through multiple intervals
      jest.advanceTimersByTime(30000);
      jest.advanceTimersByTime(30000);
      
      expect(mockPoller.getStatus).toHaveBeenCalledTimes(2);
      expect(mockIssueQueue.getStatus).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopMonitoring', () => {
    test('should stop monitoring successfully', () => {
      statusMonitor.startMonitoring();
      statusMonitor.stopMonitoring();
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(false);
    });

    test('should not stop monitoring if not running', () => {
      statusMonitor.stopMonitoring(); // Should not throw
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(false);
    });

    test('should clear interval when stopping', () => {
      statusMonitor.startMonitoring();
      statusMonitor.stopMonitoring();
      
      // Advance time - no more calls should be made
      jest.advanceTimersByTime(30000);
      
      expect(mockPoller.getStatus).toHaveBeenCalledTimes(0);
    });
  });

  describe('getStatus', () => {
    test('should aggregate status from all components', () => {
      const mockIssue = {
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
      };

      mockPoller.getStatus.mockReturnValue({ 
        running: true,
        queueStatus: {
          processing: true,
          queueSize: 2,
          nextIssue: mockIssue
        }
      });
      mockIssueQueue.getStatus.mockReturnValue({
        processing: true,
        queueSize: 2,
        nextIssue: mockIssue
      });

      const status = statusMonitor.getStatus();

      expect(status).toEqual({
        polling: true,
        processing: true,
        queueSize: 2,
        nextIssue: mockIssue
      });
    });

    test('should handle empty queue status', () => {
      mockPoller.getStatus.mockReturnValue({ 
        running: false,
        queueStatus: {
          processing: false,
          queueSize: 0,
          nextIssue: undefined
        }
      });
      mockIssueQueue.getStatus.mockReturnValue({
        processing: false,
        queueSize: 0,
        nextIssue: undefined
      });

      const status = statusMonitor.getStatus();

      expect(status).toEqual({
        polling: false,
        processing: false,
        queueSize: 0,
        nextIssue: undefined
      });
    });
  });

  describe('isCurrentlyMonitoring', () => {
    test('should return false initially', () => {
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(false);
    });

    test('should return true when monitoring is active', () => {
      statusMonitor.startMonitoring();
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(true);
    });

    test('should return false after stopping', () => {
      statusMonitor.startMonitoring();
      statusMonitor.stopMonitoring();
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(false);
    });
  });

  describe('logStatusNow', () => {
    test('should trigger immediate status logging', () => {
      statusMonitor.logStatusNow();
      
      expect(mockPoller.getStatus).toHaveBeenCalled();
      expect(mockIssueQueue.getStatus).toHaveBeenCalled();
    });

    test('should work regardless of monitoring state', () => {
      statusMonitor.logStatusNow(); // Before monitoring starts
      
      statusMonitor.startMonitoring();
      statusMonitor.logStatusNow(); // During monitoring
      
      statusMonitor.stopMonitoring();
      statusMonitor.logStatusNow(); // After monitoring stops
      
      expect(mockPoller.getStatus).toHaveBeenCalledTimes(3);
      expect(mockIssueQueue.getStatus).toHaveBeenCalledTimes(3);
    });
  });

  describe('monitoring lifecycle', () => {
    test('should handle start/stop cycling', () => {
      // Start -> Stop -> Start again
      statusMonitor.startMonitoring();
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(true);
      
      statusMonitor.stopMonitoring();
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(false);
      
      statusMonitor.startMonitoring();
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(true);
    });

    test('should stop monitoring when interval callback detects stopped state', () => {
      statusMonitor.startMonitoring();
      
      // Manually stop monitoring without calling stopMonitoring()
      (statusMonitor as any).isMonitoring = false;
      
      // Advance time to trigger the interval
      jest.advanceTimersByTime(30000);
      
      // Should have called stopMonitoring internally
      expect(statusMonitor.isCurrentlyMonitoring()).toBe(false);
    });
  });
});