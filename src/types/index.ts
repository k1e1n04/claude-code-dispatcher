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
  rateLimitRetryDelay?: number;
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

/**
 * Represents the processing steps for a GitHub issue
 */
export enum ProcessingStep {
  BRANCH_CREATION = 'branch_creation',
  IMPLEMENTATION = 'implementation', 
  CHANGE_DETECTION = 'change_detection',
  COMMIT_PUSH = 'commit_push',
  PR_CREATION = 'pr_creation',
  COMPLETED = 'completed'
}

/**
 * Processing state for an issue that can be persisted and resumed
 */
export interface ProcessingState {
  issueId: number;
  branchName: string;
  baseBranch: string;
  currentStep: ProcessingStep;
  completedSteps: ProcessingStep[];
  lastUpdated: Date;
  retryCount: number;
}

/**
 * Result of a processing operation that can be resumed
 */
export interface ResumableProcessingResult {
  success: boolean;
  branchName?: string;
  pullRequestUrl?: string;
  error?: string;
  shouldResume?: boolean;
  currentState?: ProcessingState;
}
