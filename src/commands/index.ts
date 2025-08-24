#!/usr/bin/env node

import { Command } from 'commander';
import { ClaudeCodeDispatcher } from '../services';
import { DispatcherConfig } from '../types';
import { logger, BackgroundProcessManager } from '../utils';

const program = new Command();

// Import version from package.json
import packageJson from '../../package.json';

program
  .name('claude-code-dispatcher')
  .description('CLI tool to integrate ClaudeCode with GitHub for automated issue processing')
  .version(packageJson.version);

program
  .command('start')
  .description('Start the Claude Code dispatcher')
  .requiredOption('-o, --owner <owner>', 'GitHub repository owner')
  .requiredOption('-r, --repo <repo>', 'GitHub repository name')
  .requiredOption('-a, --assignee <assignee>', 'GitHub username to monitor for assigned issues')
  .option('--allowedTools <tools...>', 'List of allowed tools for Claude Code')
  .option('--dangerously-skip-permissions', 'Skip permission checks (YOLO mode - use with caution)')
  .option('-b, --base-branch <branch>', 'Base branch for pull requests', 'main')
  .option('-i, --interval <seconds>', 'Polling interval in seconds', '60')
  .option('--max-retries <count>', 'Maximum retry attempts', '3')
  .option('-w, --working-dir <path>', 'Working directory for git operations', process.cwd())
  .option('--disallowedTools <tools...>', 'List of disallowed tools for Claude Code (optional)')
  .option('-d, --detach', 'Run dispatcher in background (detached mode)')
  .action(async (options) => {
    try {
      // Handle detached mode
      if (options.detach) {
        // Convert options to command line arguments for background process
        const args: string[] = [];
        
        args.push('-o', options.owner);
        args.push('-r', options.repo);
        args.push('-a', options.assignee);
        
        if (options.baseBranch && options.baseBranch !== 'main') {
          args.push('-b', options.baseBranch);
        }
        if (options.interval && options.interval !== '60') {
          args.push('-i', options.interval);
        }
        if (options.maxRetries && options.maxRetries !== '3') {
          args.push('--max-retries', options.maxRetries);
        }
        if (options.workingDir && options.workingDir !== process.cwd()) {
          args.push('-w', options.workingDir);
        }
        if (options.allowedTools) {
          args.push('--allowedTools', ...options.allowedTools);
        }
        if (options.disallowedTools) {
          args.push('--disallowedTools', ...options.disallowedTools);
        }
        if (options.dangerouslySkipPermissions) {
          args.push('--dangerously-skip-permissions');
        }

        const pid = await BackgroundProcessManager.startBackground(args);
        console.log(`✅ Dispatcher started in background (PID: ${pid})`);
        console.log('📝 Use \'claude-code-dispatcher logs\' to view logs');
        console.log('📊 Use \'claude-code-dispatcher status\' to check status');
        console.log('🛑 Use \'claude-code-dispatcher stop\' to stop the background process');
        return;
      }

      // Warn user about dangerous mode
      if (options.dangerouslySkipPermissions) {
        logger.warn('⚠️  YOLO mode enabled: --dangerously-skip-permissions grants full filesystem and shell access');
        logger.warn('⚠️  This should only be used in safe, non-production environments');
        
        // If both are provided, warn that dangerously-skip-permissions takes precedence
        if (options.allowedTools) {
          logger.warn('⚠️  Both --allowedTools and --dangerously-skip-permissions provided: YOLO mode takes precedence');
        }
      }

      const config: DispatcherConfig = {
        owner: options.owner,
        repo: options.repo,
        assignee: options.assignee,
        baseBranch: options.baseBranch,
        pollInterval: parseInt(options.interval),
        maxRetries: parseInt(options.maxRetries),
        allowedTools: options.allowedTools,
        disallowedTools: options.disallowedTools,
        dangerouslySkipPermissions: options.dangerouslySkipPermissions
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
  .description('Show dispatcher status (both foreground and background)')
  .option('-o, --owner <owner>', 'GitHub repository owner (for foreground status)')
  .option('-r, --repo <repo>', 'GitHub repository name (for foreground status)')
  .option('-a, --assignee <assignee>', 'GitHub username to monitor for assigned issues (for foreground status)')
  .action(async (options) => {
    try {
      // Check background process status first
      const backgroundStatus = await BackgroundProcessManager.getStatus();
      
      console.log('\n📊 Claude Code Dispatcher Status:');
      console.log('');
      console.log('🔧 Background Process:');
      
      if (backgroundStatus.running) {
        console.log(`├── 🟢 Status: Running (PID: ${backgroundStatus.pid})`);
        console.log(`├── 📁 Log File: ${backgroundStatus.logFile}`);
        console.log('└── 💡 Use \'claude-code-dispatcher logs\' to view logs');
      } else {
        console.log('└── 🔴 Status: Not running');
      }
      
      // If foreground options provided, show foreground status too
      if (options.owner && options.repo && options.assignee) {
        const config: DispatcherConfig = {
          owner: options.owner,
          repo: options.repo,
          assignee: options.assignee,
          baseBranch: 'main',
          pollInterval: 60,
          maxRetries: 3,
          allowedTools: []
        };

        const dispatcher = new ClaudeCodeDispatcher(config);
        const status = dispatcher.getStatus();
        
        console.log('');
        console.log('🔧 Foreground Process:');
        console.log(`├── 🔄 Polling: ${status.polling ? '✅ Active' : '❌ Inactive'}`);
        console.log(`├── 📋 Queue Size: ${status.queueSize}`);
        console.log(`├── ⚙️  Processing: ${status.processing ? '✅ Active' : '❌ Inactive'}`);
        
        if (status.nextIssue) {
          console.log(`└── 📝 Next Issue: #${status.nextIssue.number} - ${status.nextIssue.title}`);
        } else {
          console.log('└── 📝 Next Issue: None');
        }
      } else if (!backgroundStatus.running) {
        console.log('');
        console.log('💡 Tips:');
        console.log('  • Use -d/--detach to start in background');
        console.log('  • Use -o, -r, -a options to check foreground status');
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

program
  .command('stop')
  .description('Stop the background dispatcher process')
  .action(async () => {
    try {
      const status = await BackgroundProcessManager.getStatus();
      
      if (!status.running) {
        console.log('❌ No background dispatcher process is running');
        return;
      }
      
      console.log(`🛑 Stopping background dispatcher (PID: ${status.pid})...`);
      await BackgroundProcessManager.stop();
      console.log('✅ Background dispatcher stopped');
      
    } catch (error) {
      logger.error('Failed to stop background dispatcher:', error);
      process.exit(1);
    }
  });

program
  .command('logs')
  .description('Show logs from the background dispatcher')
  .option('-n, --lines <count>', 'Number of log lines to show', '50')
  .option('-f, --follow', 'Follow log output (tail -f style)')
  .action(async (options) => {
    try {
      const status = await BackgroundProcessManager.getStatus();
      
      if (options.follow) {
        if (!status.running) {
          console.log('❌ No background dispatcher process is running');
          return;
        }
        
        console.log(`📝 Following logs from background dispatcher (PID: ${status.pid})...`);
        console.log('Press Ctrl+C to stop following logs');
        
        // Start with recent logs
        const recentLogs = await BackgroundProcessManager.getLogs(parseInt(options.lines));
        recentLogs.forEach(line => console.log(line));
        
        // Follow new logs by polling the log file
        const fs = await import('fs/promises');
        let lastSize = 0;
        
        try {
          const stat = await fs.stat(status.logFile);
          lastSize = stat.size;
        } catch (error) {
          // File doesn't exist yet
        }
        
        const followInterval = setInterval(async () => {
          try {
            const stat = await fs.stat(status.logFile);
            if (stat.size > lastSize) {
              const fd = await fs.open(status.logFile, 'r');
              const buffer = Buffer.alloc(stat.size - lastSize);
              await fd.read(buffer, 0, buffer.length, lastSize);
              await fd.close();
              
              const newContent = buffer.toString('utf8');
              const newLines = newContent.split('\n').filter(line => line.trim());
              newLines.forEach(line => console.log(line));
              
              lastSize = stat.size;
            }
          } catch (error) {
            // Log file might not exist or be accessible
          }
        }, 1000);
        
        process.on('SIGINT', () => {
          clearInterval(followInterval);
          console.log('\n📝 Stopped following logs');
          process.exit(0);
        });
        
      } else {
        // Show recent logs
        console.log('📝 Recent logs from background dispatcher:');
        console.log(`📁 Log file: ${status.logFile}`);
        console.log('─'.repeat(80));
        
        const logs = await BackgroundProcessManager.getLogs(parseInt(options.lines));
        logs.forEach(line => console.log(line));
        
        if (logs.length === 1 && logs[0] === 'No logs found') {
          console.log('💡 Tip: Use --follow to watch logs in real-time');
        }
      }
      
    } catch (error) {
      logger.error('Failed to show logs:', error);
      process.exit(1);
    }
  });

// Always parse when required (needed for bin script)
program.parse();
