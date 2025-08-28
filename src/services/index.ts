// Backward compatibility: Export the orchestrator as the original dispatcher name
export { DispatcherOrchestrator as ClaudeCodeDispatcher } from './dispatcher-orchestrator';

// Export new modular components
export { DispatcherOrchestrator } from './dispatcher-orchestrator';
export { PrerequisitesValidator } from './prerequisites-validator';
export { ProcessingManager } from './processing-manager';
export { RateLimitHandler } from './rate-limit-handler';
export { StatusMonitor } from './status-monitor';
export { ServiceContainer } from './service-container';

// Export existing components
export { IssueQueue } from './issue-queue';
export { IssuePoller } from './poller';
export { ResumableIssueProcessor } from './resumable-issue-processor';
export { ProcessingStateManager } from './processing-state-manager';
