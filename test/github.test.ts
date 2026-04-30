/// <reference types="jest" />

import { EventEmitter } from 'events';
import https from 'https';

jest.mock('https', () => ({
  request: jest.fn(),
}));

import { extractSlackTs, appendSlackTsToDiscussion } from '../src/github';

const mockedRequest = https.request as jest.Mock;
const NEVER_REAL_GITHUB_TOKEN = 'ghp_NEVER_REAL_TOKEN_000000000000000000';
const NEVER_REAL_DISCUSSION_NODE_ID = 'D_NEVER_REAL_NODE_ID_0000000000';

function createMockReq(): EventEmitter & { write: jest.Mock; end: jest.Mock; destroy: jest.Mock } {
  const req = new EventEmitter() as EventEmitter & {
    write: jest.Mock;
    end: jest.Mock;
    destroy: jest.Mock;
  };
  req.write = jest.fn();
  req.end = jest.fn();
  req.destroy = jest.fn();
  return req;
}

interface MockGraphQLResponse {
  statusCode?: number;
  body?: string;
  error?: Error;
}

function mockGraphQLSequence(sequence: MockGraphQLResponse[]): {
  requestBodies: string[];
  requestOptions: https.RequestOptions[];
} {
  const requestBodies: string[] = [];
  const requestOptions: https.RequestOptions[] = [];

  mockedRequest.mockImplementation(
    (
      options: https.RequestOptions,
      callback: (res: EventEmitter & { statusCode: number }) => void
    ) => {
      const step = sequence.shift();
      if (!step) {
        throw new Error('Unexpected https.request call');
      }

      const req = createMockReq();
      req.write.mockImplementation((body: string) => {
        requestBodies.push(body);
      });
      requestOptions.push(options);

      if (step.error) {
        process.nextTick(() => req.emit('error', step.error));
        return req;
      }

      const statusCode = step.statusCode ?? 200;
      const responseBody = step.body ?? '';
      const res = Object.assign(new EventEmitter(), { statusCode });
      process.nextTick(() => {
        callback(res);
        if (responseBody) {
          res.emit('data', Buffer.from(responseBody));
        }
        res.emit('end');
      });

      return req;
    }
  );

  return { requestBodies, requestOptions };
}

describe('extractSlackTs', () => {
  it('returns ts when HTML comment is present', () => {
    const body = 'Discussion body\n<!-- slack-notifier:ts=1234567890.123456 -->';
    expect(extractSlackTs(body)).toBe('1234567890.123456');
  });

  it('returns undefined when no HTML comment is present', () => {
    expect(extractSlackTs('Just a regular body with no ts.')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(extractSlackTs('')).toBeUndefined();
  });

  it('handles extra whitespace in the comment', () => {
    const body = 'Body\n<!--  slack-notifier:ts=9999.001  -->';
    expect(extractSlackTs(body)).toBe('9999.001');
  });

  it('returns the first match when multiple comments exist', () => {
    const body = 'Body\n<!-- slack-notifier:ts=111.111 -->\n<!-- slack-notifier:ts=222.222 -->';
    expect(extractSlackTs(body)).toBe('111.111');
  });
});

describe('appendSlackTsToDiscussion', () => {
  afterEach(() => {
    mockedRequest.mockReset();
  });

  it('fetches the latest discussion body before appending ts', async () => {
    const { requestBodies } = mockGraphQLSequence([
      {
        body: JSON.stringify({
          data: { node: { body: 'Latest body from GitHub' } },
        }),
      },
      {
        body: JSON.stringify({
          data: { updateDiscussion: { discussion: { id: NEVER_REAL_DISCUSSION_NODE_ID } } },
        }),
      },
    ]);

    await appendSlackTsToDiscussion(
      NEVER_REAL_GITHUB_TOKEN,
      NEVER_REAL_DISCUSSION_NODE_ID,
      '1234567890.123456'
    );

    expect(mockedRequest).toHaveBeenCalledTimes(2);

    const firstRequest = JSON.parse(requestBodies[0]) as {
      query: string;
      variables: { discussionId: string };
    };
    expect(firstRequest.query).toContain('query DiscussionBody');
    expect(firstRequest.variables.discussionId).toBe(NEVER_REAL_DISCUSSION_NODE_ID);

    const secondRequest = JSON.parse(requestBodies[1]) as {
      query: string;
      variables: { discussionId: string; body: string };
    };
    expect(secondRequest.query).toContain('mutation UpdateDiscussion');
    expect(secondRequest.variables.discussionId).toBe(NEVER_REAL_DISCUSSION_NODE_ID);
    expect(secondRequest.variables.body).toContain('Latest body from GitHub');
    expect(secondRequest.variables.body).toContain('<!-- slack-notifier:ts=1234567890.123456 -->');
  });

  it('skips update when discussion already contains a stored ts', async () => {
    mockGraphQLSequence([
      {
        body: JSON.stringify({
          data: { node: { body: 'Body\n<!-- slack-notifier:ts=111.222 -->' } },
        }),
      },
    ]);

    await appendSlackTsToDiscussion(
      NEVER_REAL_GITHUB_TOKEN,
      NEVER_REAL_DISCUSSION_NODE_ID,
      '111.222'
    );

    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it('sets Authorization: Bearer header', async () => {
    const { requestOptions } = mockGraphQLSequence([
      {
        body: JSON.stringify({
          data: { node: { body: 'Body' } },
        }),
      },
      {
        body: JSON.stringify({
          data: { updateDiscussion: { discussion: { id: NEVER_REAL_DISCUSSION_NODE_ID } } },
        }),
      },
    ]);

    await appendSlackTsToDiscussion(
      NEVER_REAL_GITHUB_TOKEN,
      NEVER_REAL_DISCUSSION_NODE_ID,
      '111.222'
    );

    expect((requestOptions[0].headers as Record<string, string>)?.Authorization).toBe(
      `Bearer ${NEVER_REAL_GITHUB_TOKEN}`
    );
  });

  it('rejects when GraphQL body query returns errors', async () => {
    mockGraphQLSequence([
      {
        body: JSON.stringify({ errors: [{ message: 'NOT_FOUND' }] }),
      },
    ]);

    await expect(
      appendSlackTsToDiscussion(NEVER_REAL_GITHUB_TOKEN, NEVER_REAL_DISCUSSION_NODE_ID, '111.222')
    ).rejects.toThrow(
      `GitHub GraphQL error during discussion body query for node ${NEVER_REAL_DISCUSSION_NODE_ID}: NOT_FOUND`
    );
  });

  it('rejects when update mutation returns errors', async () => {
    mockGraphQLSequence([
      {
        body: JSON.stringify({
          data: { node: { body: 'Body' } },
        }),
      },
      {
        body: JSON.stringify({ errors: [{ message: 'FORBIDDEN' }] }),
      },
    ]);

    await expect(
      appendSlackTsToDiscussion(NEVER_REAL_GITHUB_TOKEN, NEVER_REAL_DISCUSSION_NODE_ID, '111.222')
    ).rejects.toThrow(
      `GitHub GraphQL error during discussion update for node ${NEVER_REAL_DISCUSSION_NODE_ID}: FORBIDDEN`
    );
  });

  it('rejects on non-2xx HTTP status', async () => {
    mockGraphQLSequence([
      {
        statusCode: 401,
        body: 'Unauthorized',
      },
    ]);

    await expect(
      appendSlackTsToDiscussion(NEVER_REAL_GITHUB_TOKEN, NEVER_REAL_DISCUSSION_NODE_ID, '111.222')
    ).rejects.toThrow(
      new RegExp(
        `GitHub GraphQL request failed during discussion body query for node ${NEVER_REAL_DISCUSSION_NODE_ID}: GitHub GraphQL request failed: 401`
      )
    );
  });

  it('rejects on network error', async () => {
    mockGraphQLSequence([{ error: new Error('ECONNREFUSED') }]);

    await expect(
      appendSlackTsToDiscussion(NEVER_REAL_GITHUB_TOKEN, NEVER_REAL_DISCUSSION_NODE_ID, '111.222')
    ).rejects.toThrow(
      `GitHub GraphQL request failed during discussion body query for node ${NEVER_REAL_DISCUSSION_NODE_ID}: ECONNREFUSED`
    );
  });
});
