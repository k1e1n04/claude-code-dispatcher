import { IssueQueue } from '../src/services';
import { GitHubIssue } from '../src/types';

describe('IssueQueue', () => {
  let queue: IssueQueue;
  let mockIssue: GitHubIssue;

  beforeEach(() => {
    queue = new IssueQueue();
    mockIssue = {
      id: 1,
      number: 123,
      title: 'Test issue',
      body: 'Test description',
      state: 'open',
      assignee: { login: 'testuser' },
      repository: {
        owner: { login: 'testorg' },
        name: 'testrepo'
      },
      html_url: 'https://github.com/testorg/testrepo/issues/123',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    };
  });

  test('should start empty', () => {
    expect(queue.isEmpty()).toBe(true);
    expect(queue.size()).toBe(0);
  });

  test('should enqueue issues', () => {
    queue.enqueue([mockIssue]);
    expect(queue.isEmpty()).toBe(false);
    expect(queue.size()).toBe(1);
  });

  test('should dequeue issues in FIFO order', () => {
    const issue2 = { ...mockIssue, id: 2, number: 124 };
    queue.enqueue([mockIssue, issue2]);
    
    expect(queue.dequeue()?.id).toBe(1);
    expect(queue.dequeue()?.id).toBe(2);
    expect(queue.isEmpty()).toBe(true);
  });

  test('should prevent duplicate issues', () => {
    queue.enqueue([mockIssue, mockIssue]);
    expect(queue.size()).toBe(1);
  });

  test('should manage processing state', () => {
    expect(queue.isProcessing()).toBe(false);
    queue.setProcessing(true);
    expect(queue.isProcessing()).toBe(true);
  });

  test('should provide status information', () => {
    queue.enqueue([mockIssue]);
    const status = queue.getStatus();
    
    expect(status.queueSize).toBe(1);
    expect(status.processing).toBe(false);
    expect(status.nextIssue?.id).toBe(1);
  });

  describe('edge cases and error handling', () => {
    test('should handle peek on empty queue', () => {
      expect(queue.peek()).toBeUndefined();
    });

    test('should handle dequeue on empty queue', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    test('should handle remove on non-existent issue', () => {
      const result = queue.remove(999);
      expect(result).toBe(false);
    });

    test('should successfully remove existing issue', () => {
      queue.enqueue([mockIssue]);
      const result = queue.remove(mockIssue.id);
      
      expect(result).toBe(true);
      expect(queue.size()).toBe(0);
    });

    test('should handle multiple issues with same title but different IDs', () => {
      const issue1 = { ...mockIssue, id: 1 };
      const issue2 = { ...mockIssue, id: 2 };
      
      queue.enqueue([issue1, issue2]);
      
      expect(queue.size()).toBe(2);
      expect(queue.dequeue()?.id).toBe(1);
      expect(queue.dequeue()?.id).toBe(2);
    });

    test('should handle getAll method', () => {
      const issues = [mockIssue, { ...mockIssue, id: 2, number: 124 }];
      queue.enqueue(issues);
      
      const allIssues = queue.getAll();
      
      expect(allIssues).toHaveLength(2);
      expect(allIssues).not.toBe(queue['queue']); // Should return copy
    });

    test('should handle clear method', () => {
      queue.enqueue([mockIssue]);
      expect(queue.size()).toBe(1);
      
      queue.clear();
      
      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });

    test('should maintain queue order with mixed operations', () => {
      const issues = [
        { ...mockIssue, id: 1, number: 101 },
        { ...mockIssue, id: 2, number: 102 },
        { ...mockIssue, id: 3, number: 103 }
      ];
      
      queue.enqueue([issues[0], issues[1]]);
      expect(queue.dequeue()?.number).toBe(101);
      
      queue.enqueue([issues[2]]);
      expect(queue.dequeue()?.number).toBe(102);
      expect(queue.dequeue()?.number).toBe(103);
    });

    test('should handle concurrent enqueue operations', () => {
      const batch1 = [{ ...mockIssue, id: 1 }];
      const batch2 = [{ ...mockIssue, id: 2 }];
      
      queue.enqueue(batch1);
      queue.enqueue(batch2);
      
      expect(queue.size()).toBe(2);
    });
  });
});