import { updateConversation } from './conversations';
import { pool } from './connection';
import { Conversation } from '../types';

jest.mock('./connection', () => ({
  pool: {
    query: jest.fn(),
  },
}));

describe('updateConversation linked_issue normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds linkedAt when linked_issue payload is missing it', async () => {
    const linkedIssue = {
      owner: 'imKXNNY',
      repo: 'Remote-Agentic-Coding-System',
      number: 13,
    } as unknown as Conversation['linked_issue'];

    await updateConversation('conv-1', { linked_issue: linkedIssue });

    const mockQuery = pool.query as jest.Mock;
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const queryValues = mockQuery.mock.calls[0][1] as unknown[];
    const persistedIssue = queryValues[0] as Record<string, unknown>;
    expect(persistedIssue.owner).toBe('imKXNNY');
    expect(persistedIssue.repo).toBe('Remote-Agentic-Coding-System');
    expect(persistedIssue.number).toBe(13);
    expect(typeof persistedIssue.linkedAt).toBe('string');
    expect(queryValues[1]).toBe('conv-1');
  });

  it('rejects invalid linked_issue payloads', async () => {
    const invalidLinkedIssue = {
      owner: 'imKXNNY',
      repo: 'Remote-Agentic-Coding-System',
      number: 0,
      linkedAt: new Date().toISOString(),
    } as unknown as Conversation['linked_issue'];

    await expect(updateConversation('conv-1', { linked_issue: invalidLinkedIssue })).rejects.toThrow(
      'Invalid linked_issue payload'
    );
    expect((pool.query as jest.Mock)).not.toHaveBeenCalled();
  });
});
