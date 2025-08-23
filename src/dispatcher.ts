import { GitHubClient } from './github-client';
import { IssueQueue } from './issue-queue';
import { IssuePoller } from './poller';
import { IssueProcessor } from './issue-processor';
import { GitRepository } from './git-repository';
import { ClaudeCodeExecutor } from './claude-executor';
import { PromptBuilder } from './prompt-builder';
import { DispatcherConfig, GitHubIssue } from './types';
import { logger } from './logger';

export class ClaudeCodeDispatcher {
  private githubClient: GitHubClient;
  private issueQueue: IssueQueue;
  private poller: IssuePoller;
  private processor: IssueProcessor;
  private isRunning = false;
  private processingLoop: NodeJS.Timeout | null = null;

  constructor(private config: DispatcherConfig, workingDirectory?: string) {
    this.githubClient = new GitHubClient();
    this.issueQueue = new IssueQueue();
    this.poller = new IssuePoller(this.githubClient, this.issueQueue, config);
    
    // Create dependencies for the new modular architecture
    const gitRepository = new GitRepository(workingDirectory);
    const claudeExecutor = new ClaudeCodeExecutor({
      workingDirectory,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      dangerouslySkipPermissions: config.dangerouslySkipPermissions
    });
    const promptBuilder = new PromptBuilder();
    
    this.processor = new IssueProcessor(gitRepository, claudeExecutor, promptBuilder);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Dispatcher is already running');
      return;
    }

    try {
      logger.info('Starting Claude Code Dispatcher...');
      
      await this.validatePrerequisites();
      
      this.isRunning = true;
      
      await this.poller.start();
      this.startProcessingLoop();
      
      logger.info('Claude Code Dispatcher started successfully');
      logger.info('Press Ctrl+C to stop the dispatcher');
      
      this.keepAlive();
      
    } catch (error) {
      logger.error('Failed to start dispatcher:', error);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping Claude Code Dispatcher...');
    
    this.isRunning = false;
    
    this.poller.stop();
    
    if (this.processingLoop) {
      clearTimeout(this.processingLoop);
      this.processingLoop = null;
    }
    
    this.issueQueue.setProcessing(false);
    
    logger.info('Claude Code Dispatcher stopped');
  }

  private async validatePrerequisites(): Promise<void> {
    try {
      const { execSync } = await import('child_process');
      
      logger.info('Validating prerequisites...');
      
      execSync('gh auth status', { stdio: 'pipe' });
      
      execSync(`gh repo view ${this.config.owner}/${this.config.repo}`, { stdio: 'pipe' });
      
      execSync('claude --version', { stdio: 'pipe' });
      
      logger.info('Prerequisites validation passed');
    } catch (error) {
      logger.error('Prerequisites validation failed:', error);
      throw new Error('Prerequisites validation failed. Please ensure GitHub CLI and Claude CLI are installed and authenticated.');
    }
  }

  private startProcessingLoop(): void {
    const processNext = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        if (!this.issueQueue.isEmpty() && !this.issueQueue.isProcessing()) {
          const issue = this.issueQueue.dequeue();
          
          if (issue) {
            await this.processIssue(issue);
          }
        }
      } catch (error) {
        logger.error('Error in processing loop:', error);
      }
      
      if (this.isRunning) {
        this.processingLoop = setTimeout(processNext, 5000);
      }
    };

    processNext();
  }

  private async processIssue(issue: GitHubIssue): Promise<void> {
    this.issueQueue.setProcessing(true);
    
    try {
      logger.info(`Starting to process issue #${issue.number}: ${issue.title}`);
      
      const result = await this.processor.processIssue(issue, this.config.baseBranch);
      
      if (result.success && result.branchName) {
        logger.info(`Successfully created pull request for issue #${issue.number}`);
      } else {
        logger.error(`Failed to process issue #${issue.number}: ${result.error}`);
        this.githubClient.markIssueAsProcessed(issue.id);
      }
      
    } catch (error) {
      logger.error(`Unexpected error processing issue #${issue.number}:`, error);
      this.githubClient.markIssueAsProcessed(issue.id);
    } finally {
      this.issueQueue.setProcessing(false);
    }
  }


  private keepAlive(): void {
    const keepAliveInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(keepAliveInterval);
        return;
      }
      
      const status = this.getStatus();
      logger.info(`Status - Queue: ${status.queueSize}, Processing: ${status.processing ? 'Yes' : 'No'}, Polling: ${status.polling ? 'Yes' : 'No'}`);
    }, 30000);
  }

  getStatus(): {
    polling: boolean;
    processing: boolean;
    queueSize: number;
    nextIssue?: GitHubIssue;
  } {
    const pollerStatus = this.poller.getStatus();
    const queueStatus = this.issueQueue.getStatus();
    
    return {
      polling: pollerStatus.running,
      processing: queueStatus.processing,
      queueSize: queueStatus.queueSize,
      nextIssue: queueStatus.nextIssue
    };
  }
}