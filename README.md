# Claude Code Dispatcher

A CLI tool to integrate ClaudeCode with GitHub for automated issue processing.

## Overview

Claude Code Dispatcher monitors GitHub issues assigned to a specific user, processes them using ClaudeCode, and automatically creates pull requests with the generated solutions.

## Features

- 🔍 **GitHub Issue Monitoring**: Polls for new issues assigned to specified users
- 📋 **FIFO Queue Processing**: Processes issues in first-in-first-out order
- 🤖 **ClaudeCode Integration**: Automatically generates code using ClaudeCode
- 🔄 **Automated PR Creation**: Creates pull requests with generated solutions
- ⚡ **Configurable Polling**: Adjustable polling intervals (default: 60 seconds)
- 🛡️ **Error Handling**: Built-in retry mechanisms and comprehensive logging
- 📊 **Status Monitoring**: Real-time status checking capabilities

## Prerequisites

- Node.js 16.0.0 or higher
- [GitHub CLI](https://cli.github.com/) installed and authenticated
- [Claude CLI](https://claude.ai/code) installed and authenticated (supports `--print` flag for non-interactive mode)
- Git repository with appropriate permissions

**Note**: This tool requires Claude CLI to support non-interactive execution via the `--print` flag for automation purposes. Tool permissions are configured via command-line arguments rather than settings files.

## Installation

```bash
npm install -g claude-code-dispatcher
```

## Usage

### Start the Dispatcher

```bash
claude-code-dispatcher start \
  --owner <github-owner> \
  --repo <repository-name> \
  --assignee <github-username> \
  --allowedTools "Bash(npm run build:*)" "Edit" "Write" \
  --base-branch main \
  --interval 60
```

### Check Status

```bash
claude-code-dispatcher status \
  --owner <github-owner> \
  --repo <repository-name> \
  --assignee <github-username>
```

### Validate Prerequisites

```bash
claude-code-dispatcher validate \
  --owner <github-owner> \
  --repo <repository-name>
```

## Configuration Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--owner` | `-o` | GitHub repository owner | Required |
| `--repo` | `-r` | GitHub repository name | Required |
| `--assignee` | `-a` | GitHub username to monitor | Required |
| `--allowedTools` | | List of allowed tools for Claude Code | Required |
| `--disallowedTools` | | List of disallowed tools for Claude Code | Optional |
| `--base-branch` | `-b` | Base branch for PRs | `main` |
| `--interval` | `-i` | Polling interval (seconds) | `60` |
| `--max-retries` | | Maximum retry attempts | `3` |
| `--working-dir` | `-w` | Git operations directory | Current directory |

## Tool Permissions

The dispatcher delegates tool permissions to Claude Code via command-line arguments. This follows the [Claude Code settings format](https://docs.anthropic.com/ja/docs/claude-code/settings).

### Common Tool Examples

```bash
# Allow basic file operations and safe bash commands
--allowedTools "Edit" "Write" "Read" "Bash(npm run build:*)" "Bash(git add:*)" "Bash(git commit:*)"

# Allow additional development tools
--allowedTools "Edit" "Write" "Bash(npm run test:*)" "Bash(npm run lint:*)" "Bash(gh pr create:*)"

# Restrict dangerous operations
--disallowedTools "Bash(rm:*)" "Bash(sudo:*)" "WebFetch"
```

### Recommended Tool Sets

**For basic code changes:**
```bash
--allowedTools "Edit" "Write" "Read" "Bash(git add:*)" "Bash(git commit:*)"
```

**For build and test operations:**
```bash
--allowedTools "Edit" "Write" "Bash(npm run build:*)" "Bash(npm run test:*)" "Bash(git add:*)" "Bash(git commit:*)" "Bash(gh pr create:*)"
```

**Security considerations:**
- Always use specific patterns (e.g., `"Bash(npm run build:*)"` instead of `"Bash"`)
- Explicitly disallow dangerous operations with `--disallowedTools`
- Review tool permissions regularly based on your repository's needs

## How It Works

1. **Issue Polling**: Continuously monitors GitHub for new issues assigned to the specified user
2. **Queue Management**: New issues are added to a FIFO queue for sequential processing
3. **Branch Creation**: Creates a new branch for each issue based on issue number and title
4. **Code Generation**: Uses ClaudeCode to generate solutions based on issue content
5. **Commit & Push**: Commits changes and pushes the branch to GitHub
6. **PR Creation**: Automatically creates a pull request with detailed description

## Examples

### Basic Usage

```bash
# Start monitoring issues for user 'developer' in 'myorg/myproject'
claude-code-dispatcher start \
  --owner myorg \
  --repo myproject \
  --assignee developer \
  --allowedTools "Bash(npm run build:*)" "Edit" "Write"
```

### Custom Configuration

```bash
# Poll every 30 seconds with custom base branch and tool restrictions
claude-code-dispatcher start \
  --owner myorg \
  --repo myproject \
  --assignee developer \
  --allowedTools "Bash(npm run build:*)" "Bash(npm run test:*)" "Edit" "Write" \
  --disallowedTools "WebFetch" "Bash(rm:*)" \
  --base-branch develop \
  --interval 30 \
  --max-retries 5
```

### Status Check

```bash
claude-code-dispatcher status \
  --owner myorg \
  --repo myproject \
  --assignee developer
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev -- start --owner myorg --repo myproject --assignee developer --allowedTools "Edit" "Write" "Bash(npm run build:*)"

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GitHub API    │───▶│   IssuePoller   │───▶│   IssueQueue    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Pull Request    │◀───│   Dispatcher    │───▶│ ClaudeProcessor │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Logging

The dispatcher creates comprehensive logs:
- `combined.log`: All log messages
- `error.log`: Error messages only
- Console output with colored formatting

## Error Handling

- **Retry Logic**: Automatic retries with exponential backoff
- **Rate Limiting**: GitHub API rate limit monitoring and handling
- **Graceful Shutdown**: Proper cleanup on SIGINT/SIGTERM
- **Issue Tracking**: Prevents duplicate processing of issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.