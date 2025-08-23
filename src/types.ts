/**
 * Represents a GitHub issue with essential metadata
 */
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  assignee: {
    login: string;
  } | null;
  repository: {
    owner: {
      login: string;
    };
    name: string;
  };
  html_url: string;
  created_at: string;
  updated_at: string;
}

/**
 * Configuration options for the Claude Code Dispatcher
 */
export interface DispatcherConfig {
  owner: string;
  repo: string;
  assignee: string;
  baseBranch: string;
  pollInterval: number;
  maxRetries: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  dangerouslySkipPermissions?: boolean;
}

/**
 * Result of processing a GitHub issue
 */
export interface ProcessingResult {
  success: boolean;
  branchName?: string;
  pullRequestUrl?: string;
  error?: string;
}