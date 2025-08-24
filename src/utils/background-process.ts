import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';

/**
 * Manages background processes for the dispatcher
 */
export class BackgroundProcessManager {
  private static readonly PID_FILE = path.join(os.tmpdir(), 'claude-code-dispatcher.pid');
  private static readonly LOG_FILE = path.join(os.tmpdir(), 'claude-code-dispatcher.log');

  /**
   * Starts the dispatcher in the background
   * @param args Command line arguments to pass to the background process
   * @returns Process ID of the background process
   */
  static async startBackground(args: string[]): Promise<number> {
    // Check if already running
    if (await this.isRunning()) {
      const pid = await this.getRunningPid();
      logger.warn(`Dispatcher is already running in background (PID: ${pid})`);
      return pid!;
    }

    // Prepare arguments for the spawned process (without --detach)
    const filteredArgs = args.filter(arg => arg !== '-d' && arg !== '--detach');
    
    // Get the path to this script to re-execute it without --detach
    const scriptPath = process.argv[1];
    
    logger.info('Starting dispatcher in background...');
    
    // Spawn the process in detached mode
    const child = spawn(process.execPath, [scriptPath, 'start', ...filteredArgs], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: process.env
    });

    // Save PID to file
    await fs.writeFile(this.PID_FILE, child.pid!.toString());
    
    // Set up log file streaming
    const logStream = await fs.open(this.LOG_FILE, 'a');
    
    // Pipe stdout and stderr to log file
    child.stdout?.pipe(logStream.createWriteStream());
    child.stderr?.pipe(logStream.createWriteStream());
    
    // Handle process exit
    child.on('exit', async (code) => {
      logger.info(`Background dispatcher process exited with code ${code}`);
      await this.cleanup();
    });

    child.on('error', async (error) => {
      logger.error('Background dispatcher process error:', error);
      await this.cleanup();
    });

    // Unref the process so the parent can exit
    child.unref();

    logger.info(`Dispatcher started in background (PID: ${child.pid})`);
    logger.info(`Logs will be written to: ${this.LOG_FILE}`);
    
    return child.pid!;
  }

  /**
   * Checks if the dispatcher is currently running in the background
   */
  static async isRunning(): Promise<boolean> {
    try {
      const pid = await this.getRunningPid();
      if (!pid) return false;

      // Check if process is actually running
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // Process not found or not accessible
      await this.cleanup();
      return false;
    }
  }

  /**
   * Gets the PID of the running background process
   */
  static async getRunningPid(): Promise<number | null> {
    try {
      const pidStr = await fs.readFile(this.PID_FILE, 'utf8');
      return parseInt(pidStr.trim(), 10);
    } catch (error) {
      return null;
    }
  }

  /**
   * Stops the background dispatcher process
   */
  static async stop(): Promise<void> {
    const pid = await this.getRunningPid();
    if (!pid) {
      logger.warn('No background dispatcher process found');
      return;
    }

    try {
      logger.info(`Stopping background dispatcher (PID: ${pid})...`);
      
      // Send SIGTERM for graceful shutdown
      process.kill(pid, 'SIGTERM');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if still running
      if (await this.isRunning()) {
        logger.warn('Process did not exit gracefully, sending SIGKILL...');
        process.kill(pid, 'SIGKILL');
      }
      
      await this.cleanup();
      logger.info('Background dispatcher stopped');
      
    } catch (error) {
      logger.error('Error stopping background process:', error);
      await this.cleanup();
    }
  }

  /**
   * Gets the status of the background process
   */
  static async getStatus(): Promise<{ running: boolean; pid?: number; logFile: string }> {
    const running = await this.isRunning();
    const pid = running ? await this.getRunningPid() : undefined;
    
    return {
      running,
      pid: pid || undefined,
      logFile: this.LOG_FILE
    };
  }

  /**
   * Gets recent logs from the background process
   */
  static async getLogs(lines: number = 50): Promise<string[]> {
    try {
      const content = await fs.readFile(this.LOG_FILE, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      return allLines.slice(-lines);
    } catch (error) {
      return ['No logs found'];
    }
  }

  /**
   * Cleans up PID file and other resources
   */
  private static async cleanup(): Promise<void> {
    try {
      await fs.unlink(this.PID_FILE);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }
}