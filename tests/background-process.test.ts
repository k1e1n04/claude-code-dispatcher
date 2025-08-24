import { BackgroundProcessManager } from '../src/utils/background-process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('BackgroundProcessManager', () => {
  const pidFile = path.join(os.tmpdir(), 'claude-code-dispatcher.pid');
  const logFile = path.join(os.tmpdir(), 'claude-code-dispatcher.log');

  beforeEach(async () => {
    // Clean up any existing files
    try {
      await fs.unlink(pidFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }
    
    try {
      await fs.unlink(logFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await BackgroundProcessManager.stop();
    } catch (error) {
      // Ignore errors during cleanup
    }
    
    try {
      await fs.unlink(pidFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }
    
    try {
      await fs.unlink(logFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe('isRunning', () => {
    it('should return false when no background process is running', async () => {
      const isRunning = await BackgroundProcessManager.isRunning();
      expect(isRunning).toBe(false);
    });

    it('should return false when PID file contains invalid PID', async () => {
      await fs.writeFile(pidFile, 'invalid-pid');
      const isRunning = await BackgroundProcessManager.isRunning();
      expect(isRunning).toBe(false);
    });

    it('should return false when PID file contains non-existent PID', async () => {
      await fs.writeFile(pidFile, '999999');
      const isRunning = await BackgroundProcessManager.isRunning();
      expect(isRunning).toBe(false);
    });
  });

  describe('getRunningPid', () => {
    it('should return null when no PID file exists', async () => {
      const pid = await BackgroundProcessManager.getRunningPid();
      expect(pid).toBeNull();
    });

    it('should return PID from file when it exists', async () => {
      await fs.writeFile(pidFile, '12345');
      const pid = await BackgroundProcessManager.getRunningPid();
      expect(pid).toBe(12345);
    });

    it('should handle whitespace in PID file', async () => {
      await fs.writeFile(pidFile, '  67890  \n');
      const pid = await BackgroundProcessManager.getRunningPid();
      expect(pid).toBe(67890);
    });
  });

  describe('getStatus', () => {
    it('should return correct status when not running', async () => {
      const status = await BackgroundProcessManager.getStatus();
      expect(status.running).toBe(false);
      expect(status.pid).toBeUndefined();
      expect(status.logFile).toBe(logFile);
    });
  });

  describe('getLogs', () => {
    it('should return "No logs found" when log file does not exist', async () => {
      const logs = await BackgroundProcessManager.getLogs();
      expect(logs).toEqual(['No logs found']);
    });

    it('should return log lines when log file exists', async () => {
      const testLogs = 'Line 1\nLine 2\nLine 3\n';
      await fs.writeFile(logFile, testLogs);
      
      const logs = await BackgroundProcessManager.getLogs();
      expect(logs).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should limit log lines when specified', async () => {
      const testLogs = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n';
      await fs.writeFile(logFile, testLogs);
      
      const logs = await BackgroundProcessManager.getLogs(2);
      expect(logs).toEqual(['Line 4', 'Line 5']);
    });

    it('should filter empty lines', async () => {
      const testLogs = 'Line 1\n\nLine 2\n\nLine 3\n\n';
      await fs.writeFile(logFile, testLogs);
      
      const logs = await BackgroundProcessManager.getLogs();
      expect(logs).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });
  });

  describe('stop', () => {
    it('should handle gracefully when no process is running', async () => {
      await expect(BackgroundProcessManager.stop()).resolves.toBeUndefined();
    });

    it('should clean up PID file when process is not running', async () => {
      await fs.writeFile(pidFile, '999999');
      
      await BackgroundProcessManager.stop();
      
      const exists = await fs.access(pidFile).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  // Note: We cannot easily test startBackground without actually spawning processes
  // which would be complex and potentially flaky in a test environment.
  // Integration tests would be better suited for this functionality.
});