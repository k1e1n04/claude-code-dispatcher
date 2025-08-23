#!/usr/bin/env node

import { Command } from 'commander';
import { ClaudeCodeDispatcher } from './dispatcher';
import { DispatcherConfig } from './types';
import { logger } from './logger';

const program = new Command();

program
  .name('claude-code-dispatcher')
  .description('CLI tool to integrate ClaudeCode with GitHub for automated issue processing')
  .version('1.0.0');

program
  .command('start')
  .description('Start the Claude Code dispatcher')
  .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
  .requiredOption('-r, --repo <repo>', 'GitHub repository name')
  .requiredOption('-a, --assignee <assignee>', 'GitHub username to monitor for assigned issues')
  .option('-b, --base-branch <branch>', 'Base branch for pull requests', 'main')
  .option('-i, --interval <seconds>', 'Polling interval in seconds', '60')
  .option('--max-retries <count>', 'Maximum retry attempts', '3')
  .option('-w, --working-dir <path>', 'Working directory for git operations', process.cwd())
  .action(async (options) => {
    try {
      const config: DispatcherConfig = {
        owner: options.owner,
        repo: options.repo,
        assignee: options.assignee,
        baseBranch: options.baseBranch,
        pollInterval: parseInt(options.interval),
        maxRetries: parseInt(options.maxRetries)
      };

      logger.info('Starting Claude Code Dispatcher with configuration:', config);
      
      const dispatcher = new ClaudeCodeDispatcher(config, options.workingDir);
      
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await dispatcher.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await dispatcher.stop();
        process.exit(0);
      });

      await dispatcher.start();
      
    } catch (error) {
      logger.error('Failed to start dispatcher:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show dispatcher status')
  .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
  .requiredOption('-r, --repo <repo>', 'GitHub repository name')
  .requiredOption('-a, --assignee <assignee>', 'GitHub username to monitor for assigned issues')
  .action(async (options) => {
    try {
      const config: DispatcherConfig = {
        owner: options.owner,
        repo: options.repo,
        assignee: options.assignee,
        baseBranch: 'main',
        pollInterval: 60,
        maxRetries: 3
      };

      const dispatcher = new ClaudeCodeDispatcher(config);
      const status = dispatcher.getStatus();
      
      console.log('\n📊 Claude Code Dispatcher Status:');
      console.log(`├── 🔄 Polling: ${status.polling ? '✅ Active' : '❌ Inactive'}`);
      console.log(`├── 📋 Queue Size: ${status.queueSize}`);
      console.log(`├── ⚙️  Processing: ${status.processing ? '✅ Active' : '❌ Inactive'}`);
      
      if (status.nextIssue) {
        console.log(`└── 📝 Next Issue: #${status.nextIssue.number} - ${status.nextIssue.title}`);
      } else {
        console.log('└── 📝 Next Issue: None');
      }
      
    } catch (error) {
      logger.error('Failed to get status:', error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate GitHub authentication and repository access')
  .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
  .requiredOption('-r, --repo <repo>', 'GitHub repository name')
  .action(async (options) => {
    try {
      const { execSync } = await import('child_process');
      
      console.log('🔍 Validating GitHub CLI authentication...');
      execSync('gh auth status', { stdio: 'pipe' });
      console.log('✅ GitHub CLI authentication: OK');
      
      console.log('🔍 Validating repository access...');
      execSync(`gh repo view ${options.owner}/${options.repo}`, { stdio: 'pipe' });
      console.log('✅ Repository access: OK');
      
      console.log('🔍 Testing API rate limit...');
      const rateLimit = JSON.parse(execSync('gh api rate_limit', { encoding: 'utf8' }));
      console.log(`✅ API rate limit: ${rateLimit.rate.remaining}/${rateLimit.rate.limit} remaining`);
      
      console.log('\n🎉 All validations passed! Ready to start dispatcher.');
      
    } catch (error) {
      console.error('❌ Validation failed:', error);
      console.log('\nPlease ensure:');
      console.log('1. GitHub CLI is installed: gh --version');
      console.log('2. You are authenticated: gh auth login');
      console.log('3. You have access to the repository');
      process.exit(1);
    }
  });

if (require.main === module) {
  program.parse();
}