import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';

/**
 * Manages background processes for the dispatcher
 */
export class BackgroundProcessManager {
  /**
   * Gets repository-specific file paths
   */
  private static getFilePaths(owner: string, repo: string) {
    const sanitizedName = `${owner}-${repo}`.replace(/[^a-zA-Z0-9-_]/g, '_');
    return {
      pidFile: path.join(os.tmpdir(), `claude-code-dispatcher-${sanitizedName}.pid`),
      lockFile: path.join(os.tmpdir(), `claude-code-dispatcher-${sanitizedName}.lock`),
      logFile: path.join(os.tmpdir(), `claude-code-dispatcher-${sanitizedName}.log`)
    };
  }

  /**
   * Starts the dispatcher in the background
   * @param owner GitHub repository owner
   * @param repo GitHub repository name  
   * @param args Command line arguments to pass to the background process
   * @returns Process ID of the background process
   */
  static async startBackground(owner: string, repo: string, args: string[]): Promise<number> {
    const files = this.getFilePaths(owner, repo);
    // Use file locking to prevent race conditions
    return this.withLock(files.lockFile, async () => {
      // Check if already running (inside lock)
      if (await this.isRunning(owner, repo)) {
        const pid = await this.getRunningPid(owner, repo);
        logger.warn(`Dispatcher for ${owner}/${repo} is already running in background (PID: ${pid})`);
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
      await fs.writeFile(files.pidFile, child.pid!.toString());
      
      // Set up log file streaming
      const logStream = await fs.open(files.logFile, 'a');
      
      // Pipe stdout and stderr to log file
      child.stdout?.pipe(logStream.createWriteStream());
      child.stderr?.pipe(logStream.createWriteStream());
      
      // Handle process exit
      child.on('exit', async (code) => {
        logger.info(`Background dispatcher process for ${owner}/${repo} exited with code ${code}`);
        await this.cleanup(owner, repo);
      });

      child.on('error', async (error) => {
        logger.error(`Background dispatcher process for ${owner}/${repo} error:`, error);
        await this.cleanup(owner, repo);
      });

      // Unref the process so the parent can exit
      child.unref();

      logger.info(`Dispatcher for ${owner}/${repo} started in background (PID: ${child.pid})`);
      logger.info(`Logs will be written to: ${files.logFile}`);
      
      return child.pid!;
    });
  }

  /**
   * Checks if the dispatcher is currently running in the background
   * @param owner GitHub repository owner
   * @param repo GitHub repository name
   */
  static async isRunning(owner: string, repo: string): Promise<boolean> {
    try {
      const pid = await this.getRunningPid(owner, repo);
      if (!pid) return false;

      // Check if process is actually running
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // Process not found or not accessible
      await this.cleanup(owner, repo);
      return false;
    }
  }

  /**
   * Gets the PID of the running background process
   * @param owner GitHub repository owner
   * @param repo GitHub repository name
   */
  static async getRunningPid(owner: string, repo: string): Promise<number | null> {
    try {
      const files = this.getFilePaths(owner, repo);
      const pidStr = await fs.readFile(files.pidFile, 'utf8');
      return parseInt(pidStr.trim(), 10);
    } catch (error) {
      return null;
    }
  }

  /**
   * Stops the background dispatcher process
   * @param owner GitHub repository owner
   * @param repo GitHub repository name
   */
  static async stop(owner: string, repo: string): Promise<void> {
    const pid = await this.getRunningPid(owner, repo);
    if (!pid) {
      logger.warn(`No background dispatcher process found for ${owner}/${repo}`);
      return;
    }

    try {
      logger.info(`Stopping background dispatcher for ${owner}/${repo} (PID: ${pid})...`);
      
      // Send SIGTERM for graceful shutdown
      process.kill(pid, 'SIGTERM');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if still running
      if (await this.isRunning(owner, repo)) {
        logger.warn('Process did not exit gracefully, sending SIGKILL...');
        process.kill(pid, 'SIGKILL');
      }
      
      await this.cleanup(owner, repo);
      logger.info(`Background dispatcher for ${owner}/${repo} stopped`);
      
    } catch (error) {
      logger.error('Error stopping background process:', error);
      await this.cleanup(owner, repo);
    }
  }

  /**
   * Gets the status of the background process
   * @param owner GitHub repository owner
   * @param repo GitHub repository name
   */
  static async getStatus(owner: string, repo: string): Promise<{ running: boolean; pid?: number; logFile: string }> {
    const files = this.getFilePaths(owner, repo);
    const running = await this.isRunning(owner, repo);
    const pid = running ? await this.getRunningPid(owner, repo) : undefined;
    
    return {
      running,
      pid: pid || undefined,
      logFile: files.logFile
    };
  }

  /**
   * Gets recent logs from the background process
   * @param owner GitHub repository owner
   * @param repo GitHub repository name
   * @param lines Number of lines to return
   */
  static async getLogs(owner: string, repo: string, lines: number = 50): Promise<string[]> {
    try {
      const files = this.getFilePaths(owner, repo);
      const content = await fs.readFile(files.logFile, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      return allLines.slice(-lines);
    } catch (error) {
      return ['No logs found'];
    }
  }

  /**
   * Executes a function with file locking to prevent race conditions
   */
  private static async withLock<T>(lockFile: string, fn: () => Promise<T>): Promise<T> {
    let lockHandle: fs.FileHandle | null = null;
    
    try {
      // Try to create lock file atomically
      lockHandle = await fs.open(lockFile, 'wx');
      
      // Execute the function while holding the lock
      const result = await fn();
      
      return result;
    } catch (error: unknown) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST') {
        // Lock file exists, another process is running
        throw new Error('Another dispatcher process is already starting or running');
      }
      throw error;
    } finally {
      // Clean up lock file
      if (lockHandle) {
        await lockHandle.close();
        try {
          await fs.unlink(lockFile);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Cleans up PID file and other resources
   * @param owner GitHub repository owner
   * @param repo GitHub repository name
   */
  private static async cleanup(owner: string, repo: string): Promise<void> {
    const files = this.getFilePaths(owner, repo);
    
    try {
      await fs.unlink(files.pidFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }
    
    try {
      await fs.unlink(files.lockFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }
}