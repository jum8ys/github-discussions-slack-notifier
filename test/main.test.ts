/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

import fs from 'fs';
import os from 'os';
import path from 'path';

const NEVER_REAL_GH_USER_AUTHOR = 'c1d2e3f4-a5b6-7890-cdef-012345678901';
const NEVER_REAL_GH_USER_COMMENTER = 'd2e3f4a5-b6c7-8901-defa-123456789012';
const NEVER_REAL_SLACK_CHANNEL_ID = 'CNEVER_REAL_TEST_CHANNEL_0';
const NEVER_REAL_SLACK_BOT_TOKEN = 'xoxb-NEVER-REAL-TEST-TOKEN';
const NEVER_REAL_GITHUB_TOKEN = 'ghp_NEVER_REAL_TEST_TOKEN_000000';
const NEVER_REAL_DISCUSSION_NODE_ID = 'D_NEVER_REAL_TEST_NODE_ID_0000';

function writeEventPayload(payload: Record<string, unknown>): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdsn-evt-'));
  const eventPath = path.join(tmpDir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify(payload), 'utf8');
  return eventPath;
}

// Save and restore env/process state around each test
const originalEnv = { ...process.env };
const originalExit = process.exit;
let mockExit: jest.Mock;
let consoleSpy: jest.SpyInstance;
let consoleErrorSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

beforeEach(() => {
  process.env = { ...originalEnv };
  mockExit = jest.fn().mockImplementation((() => {
    throw new Error('process.exit');
  }) as () => never);
  process.exit = mockExit as unknown as typeof process.exit;
  consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
});

afterEach(() => {
  process.env = originalEnv;
  process.exit = originalExit;
  consoleSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('index.ts entrypoint', () => {
  it('should exit with 1 when both slack_webhook_url and slack_bot_token are missing', () => {
    delete process.env.INPUT_SLACK_WEBHOOK_URL;
    delete process.env.INPUT_SLACK_BOT_TOKEN;
    process.env.GITHUB_EVENT_PATH = '/tmp/dummy';

    expect(() => {
      jest.isolateModules(() => {
        require('../src/index');
      });
    }).toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing Slack credentials')
    );
  });

  it('should exit with 1 when slack_bot_token is set but slack_channel_id is missing', () => {
    process.env.INPUT_SLACK_BOT_TOKEN = NEVER_REAL_SLACK_BOT_TOKEN;
    delete process.env.INPUT_SLACK_CHANNEL_ID;
    process.env.GITHUB_EVENT_PATH = '/tmp/dummy';

    expect(() => {
      jest.isolateModules(() => {
        require('../src/index');
      });
    }).toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('slack_channel_id is required')
    );
  });

  it('should exit with 1 when slack_bot_token is set but github_token is missing', () => {
    process.env.INPUT_SLACK_BOT_TOKEN = NEVER_REAL_SLACK_BOT_TOKEN;
    process.env.INPUT_SLACK_CHANNEL_ID = NEVER_REAL_SLACK_CHANNEL_ID;
    delete process.env.INPUT_GITHUB_TOKEN;
    process.env.GITHUB_EVENT_PATH = '/tmp/dummy';

    expect(() => {
      jest.isolateModules(() => {
        require('../src/index');
      });
    }).toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('github_token is required')
    );
  });

  it('should exit with 1 when thread_mode is invalid in bot_token mode', () => {
    process.env.INPUT_SLACK_BOT_TOKEN = NEVER_REAL_SLACK_BOT_TOKEN;
    process.env.INPUT_SLACK_CHANNEL_ID = NEVER_REAL_SLACK_CHANNEL_ID;
    process.env.INPUT_GITHUB_TOKEN = NEVER_REAL_GITHUB_TOKEN;
    process.env.INPUT_THREAD_MODE = 'invalid';
    process.env.GITHUB_EVENT_PATH = '/tmp/dummy';

    expect(() => {
      jest.isolateModules(() => {
        require('../src/index');
      });
    }).toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid thread_mode'));
  });

  it('should exit with 1 when thread_mode is invalid in webhook mode', () => {
    process.env.INPUT_SLACK_WEBHOOK_URL = 'https://hooks.slack.invalid/test';
    process.env.INPUT_THREAD_MODE = 'invalid';
    process.env.GITHUB_EVENT_PATH = '/tmp/dummy';

    expect(() => {
      jest.isolateModules(() => {
        require('../src/index');
      });
    }).toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid thread_mode'));
  });

  it('should exit with 0 when no event payload is available', () => {
    process.env.INPUT_SLACK_WEBHOOK_URL = 'https://hooks.slack.invalid/test';
    process.env.GITHUB_EVENT_PATH = '/nonexistent/path/event.json';

    expect(() => {
      jest.isolateModules(() => {
        require('../src/index');
      });
    }).toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should ignore unhandled event types', async () => {
    const eventPath = writeEventPayload({ action: 'edited' });
    process.env.INPUT_SLACK_WEBHOOK_URL = 'https://hooks.slack.invalid/test';
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_EVENT_NAME = 'push';

    jest.isolateModules(() => {
      require('../src/index');
    });

    await new Promise<void>((r) => setImmediate(r));

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ignored'));
  });

  it('should call sendSlackMessage when only webhook url is set (webhook-only mode)', async () => {
    const eventPath = writeEventPayload({
      action: 'created',
      discussion: {
        title: 'Test',
        body: 'Hello',
        html_url: 'https://github.invalid/owner/repo/discussions/1',
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
        category: { name: 'General' },
      },
    });
    process.env.INPUT_SLACK_WEBHOOK_URL = 'https://hooks.slack.invalid/test';
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_EVENT_NAME = 'discussion';

    const mockSend = jest.fn().mockResolvedValue('ok');
    const mockPost = jest.fn();

    jest.isolateModules(() => {
      jest.mock('../src/notifier', () => ({
        ...jest.requireActual('../src/notifier'),
        sendSlackMessage: mockSend,
        postSlackApiMessage: mockPost,
      }));
      require('../src/index');
    });

    await new Promise<void>((r) => setImmediate(r));

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('discussion.created with bot_token: calls postSlackApiMessage and appendSlackTsToDiscussion', async () => {
    const eventPath = writeEventPayload({
      action: 'created',
      discussion: {
        title: 'Thread test',
        body: 'Body text',
        html_url: 'https://github.invalid/owner/repo/discussions/42',
        node_id: NEVER_REAL_DISCUSSION_NODE_ID,
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
        category: { name: 'General' },
      },
    });
    process.env.INPUT_SLACK_BOT_TOKEN = NEVER_REAL_SLACK_BOT_TOKEN;
    process.env.INPUT_SLACK_CHANNEL_ID = NEVER_REAL_SLACK_CHANNEL_ID;
    process.env.INPUT_GITHUB_TOKEN = NEVER_REAL_GITHUB_TOKEN;
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_EVENT_NAME = 'discussion';

    const mockPost = jest.fn().mockResolvedValue('1234567890.123456');
    const mockAppend = jest.fn().mockResolvedValue(undefined);

    jest.isolateModules(() => {
      jest.mock('../src/notifier', () => ({
        ...jest.requireActual('../src/notifier'),
        postSlackApiMessage: mockPost,
      }));
      jest.mock('../src/github', () => ({
        ...jest.requireActual('../src/github'),
        appendSlackTsToDiscussion: mockAppend,
      }));
      require('../src/index');
    });

    await new Promise<void>((r) => setImmediate(r));

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockAppend).toHaveBeenCalledWith(
      NEVER_REAL_GITHUB_TOKEN,
      NEVER_REAL_DISCUSSION_NODE_ID,
      '1234567890.123456'
    );
  });

  it('discussion.created with bot_token: does not fail the job when appendSlackTsToDiscussion fails', async () => {
    const eventPath = writeEventPayload({
      action: 'created',
      discussion: {
        title: 'Thread test',
        body: 'Body text',
        html_url: 'https://github.invalid/owner/repo/discussions/42',
        node_id: NEVER_REAL_DISCUSSION_NODE_ID,
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
        category: { name: 'General' },
      },
    });
    process.env.INPUT_SLACK_BOT_TOKEN = NEVER_REAL_SLACK_BOT_TOKEN;
    process.env.INPUT_SLACK_CHANNEL_ID = NEVER_REAL_SLACK_CHANNEL_ID;
    process.env.INPUT_GITHUB_TOKEN = NEVER_REAL_GITHUB_TOKEN;
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_EVENT_NAME = 'discussion';

    const mockPost = jest.fn().mockResolvedValue('1234567890.123456');
    const mockAppend = jest.fn().mockRejectedValue(new Error('GitHub GraphQL request failed: 500'));

    jest.isolateModules(() => {
      jest.mock('../src/notifier', () => ({
        ...jest.requireActual('../src/notifier'),
        postSlackApiMessage: mockPost,
      }));
      jest.mock('../src/github', () => ({
        ...jest.requireActual('../src/github'),
        appendSlackTsToDiscussion: mockAppend,
      }));
      require('../src/index');
    });

    await new Promise<void>((r) => setImmediate(r));

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockAppend).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist Slack thread ts'),
      expect.any(Error)
    );
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('discussion.answered without stored ts: posts top-level and saves ts for future threading', async () => {
    const eventPath = writeEventPayload({
      action: 'answered',
      answer: {
        body: 'Accepted answer',
        html_url: 'https://github.invalid/owner/repo/discussions/42#discussioncomment-2',
        user: { login: NEVER_REAL_GH_USER_COMMENTER },
      },
      discussion: {
        title: 'Thread test',
        body: 'No ts in this body',
        html_url: 'https://github.invalid/owner/repo/discussions/42',
        node_id: NEVER_REAL_DISCUSSION_NODE_ID,
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
        category: { name: 'General' },
      },
    });
    process.env.INPUT_SLACK_BOT_TOKEN = NEVER_REAL_SLACK_BOT_TOKEN;
    process.env.INPUT_SLACK_CHANNEL_ID = NEVER_REAL_SLACK_CHANNEL_ID;
    process.env.INPUT_GITHUB_TOKEN = NEVER_REAL_GITHUB_TOKEN;
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_EVENT_NAME = 'discussion';

    const mockPost = jest.fn().mockResolvedValue('1111111111.000002');
    const mockAppend = jest.fn().mockResolvedValue(undefined);

    jest.isolateModules(() => {
      jest.mock('../src/notifier', () => ({
        ...jest.requireActual('../src/notifier'),
        postSlackApiMessage: mockPost,
      }));
      jest.mock('../src/github', () => ({
        ...jest.requireActual('../src/github'),
        appendSlackTsToDiscussion: mockAppend,
      }));
      require('../src/index');
    });

    await new Promise<void>((r) => setImmediate(r));

    expect(mockPost).toHaveBeenCalledTimes(1);
    const calledPayload = mockPost.mock.calls[0][2] as Record<string, unknown>;
    expect(calledPayload.thread_ts).toBeUndefined();
    expect(mockAppend).toHaveBeenCalledWith(
      NEVER_REAL_GITHUB_TOKEN,
      NEVER_REAL_DISCUSSION_NODE_ID,
      '1111111111.000002'
    );
  });

  it('discussion.answered with stored ts: posts as thread reply', async () => {
    const bodyWithTs = 'Discussion body\n<!-- slack-notifier:ts=9876543210.000001 -->';
    const eventPath = writeEventPayload({
      action: 'answered',
      answer: {
        body: 'Accepted answer',
        html_url: 'https://github.invalid/owner/repo/discussions/42#discussioncomment-2',
        user: { login: NEVER_REAL_GH_USER_COMMENTER },
      },
      discussion: {
        title: 'Thread test',
        body: bodyWithTs,
        html_url: 'https://github.invalid/owner/repo/discussions/42',
        node_id: NEVER_REAL_DISCUSSION_NODE_ID,
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
        category: { name: 'Q&A' },
      },
    });
    process.env.INPUT_SLACK_BOT_TOKEN = NEVER_REAL_SLACK_BOT_TOKEN;
    process.env.INPUT_SLACK_CHANNEL_ID = NEVER_REAL_SLACK_CHANNEL_ID;
    process.env.INPUT_GITHUB_TOKEN = NEVER_REAL_GITHUB_TOKEN;
    process.env.INPUT_THREAD_MODE = 'channel_and_thread';
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_EVENT_NAME = 'discussion';

    const mockPost = jest.fn().mockResolvedValue('1111111111.000003');
    const mockAppend = jest.fn().mockResolvedValue(undefined);

    jest.isolateModules(() => {
      jest.mock('../src/notifier', () => ({
        ...jest.requireActual('../src/notifier'),
        postSlackApiMessage: mockPost,
      }));
      jest.mock('../src/github', () => ({
        ...jest.requireActual('../src/github'),
        appendSlackTsToDiscussion: mockAppend,
      }));
      require('../src/index');
    });

    await new Promise<void>((r) => setImmediate(r));

    expect(mockPost).toHaveBeenCalledTimes(1);
    const calledPayload = mockPost.mock.calls[0][2] as Record<string, unknown>;
    expect(calledPayload.thread_ts).toBe('9876543210.000001');
    expect(calledPayload.reply_broadcast).toBe(true);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it('discussion_comment.created with stored ts: posts as thread reply', async () => {
    const bodyWithTs = 'Discussion body\n<!-- slack-notifier:ts=9876543210.000001 -->';
    const eventPath = writeEventPayload({
      action: 'created',
      comment: {
        body: 'A comment',
        html_url: 'https://github.invalid/owner/repo/discussions/42#discussioncomment-1',
        user: { login: NEVER_REAL_GH_USER_COMMENTER },
      },
      discussion: {
        title: 'Thread test',
        body: bodyWithTs,
        html_url: 'https://github.invalid/owner/repo/discussions/42',
        node_id: NEVER_REAL_DISCUSSION_NODE_ID,
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
        category: { name: 'General' },
      },
    });
    process.env.INPUT_SLACK_BOT_TOKEN = NEVER_REAL_SLACK_BOT_TOKEN;
    process.env.INPUT_SLACK_CHANNEL_ID = NEVER_REAL_SLACK_CHANNEL_ID;
    process.env.INPUT_GITHUB_TOKEN = NEVER_REAL_GITHUB_TOKEN;
    process.env.INPUT_THREAD_MODE = 'channel_and_thread';
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_EVENT_NAME = 'discussion_comment';

    const mockPost = jest.fn().mockResolvedValue('1111111111.000001');

    jest.isolateModules(() => {
      jest.mock('../src/notifier', () => ({
        ...jest.requireActual('../src/notifier'),
        postSlackApiMessage: mockPost,
      }));
      require('../src/index');
    });

    await new Promise<void>((r) => setImmediate(r));

    expect(mockPost).toHaveBeenCalledTimes(1);
    const calledPayload = mockPost.mock.calls[0][2] as Record<string, unknown>;
    expect(calledPayload.thread_ts).toBe('9876543210.000001');
    expect(calledPayload.reply_broadcast).toBe(true);
  });

  it('discussion_comment.created with thread_only: reply_broadcast is false', async () => {
    const bodyWithTs = 'Discussion body\n<!-- slack-notifier:ts=9876543210.000001 -->';
    const eventPath = writeEventPayload({
      action: 'created',
      comment: {
        body: 'Comment',
        html_url: 'https://github.invalid/x',
        user: { login: NEVER_REAL_GH_USER_COMMENTER },
      },
      discussion: {
        title: 'T',
        body: bodyWithTs,
        html_url: 'https://github.invalid/d',
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
        category: { name: 'Q&A' },
      },
    });
    process.env.INPUT_SLACK_BOT_TOKEN = NEVER_REAL_SLACK_BOT_TOKEN;
    process.env.INPUT_SLACK_CHANNEL_ID = NEVER_REAL_SLACK_CHANNEL_ID;
    process.env.INPUT_GITHUB_TOKEN = NEVER_REAL_GITHUB_TOKEN;
    process.env.INPUT_THREAD_MODE = 'thread_only';
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_EVENT_NAME = 'discussion_comment';

    const mockPost = jest.fn().mockResolvedValue('1111111111.000001');

    jest.isolateModules(() => {
      jest.mock('../src/notifier', () => ({
        ...jest.requireActual('../src/notifier'),
        postSlackApiMessage: mockPost,
      }));
      require('../src/index');
    });

    await new Promise<void>((r) => setImmediate(r));

    const calledPayload = mockPost.mock.calls[0][2] as Record<string, unknown>;
    expect(calledPayload.thread_ts).toBe('9876543210.000001');
    expect(calledPayload.reply_broadcast).toBe(false);
  });

  it('discussion_comment.created without stored ts: posts top-level and saves ts for future threading', async () => {
    const eventPath = writeEventPayload({
      action: 'created',
      comment: {
        body: 'Comment',
        html_url: 'https://github.invalid/x',
        user: { login: NEVER_REAL_GH_USER_COMMENTER },
      },
      discussion: {
        title: 'T',
        body: 'No ts in this body',
        html_url: 'https://github.invalid/d',
        node_id: NEVER_REAL_DISCUSSION_NODE_ID,
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
        category: { name: 'General' },
      },
    });
    process.env.INPUT_SLACK_BOT_TOKEN = NEVER_REAL_SLACK_BOT_TOKEN;
    process.env.INPUT_SLACK_CHANNEL_ID = NEVER_REAL_SLACK_CHANNEL_ID;
    process.env.INPUT_GITHUB_TOKEN = NEVER_REAL_GITHUB_TOKEN;
    process.env.GITHUB_EVENT_PATH = eventPath;
    process.env.GITHUB_EVENT_NAME = 'discussion_comment';

    const mockPost = jest.fn().mockResolvedValue('1111111111.000001');
    const mockAppend = jest.fn().mockResolvedValue(undefined);

    jest.isolateModules(() => {
      jest.mock('../src/notifier', () => ({
        ...jest.requireActual('../src/notifier'),
        postSlackApiMessage: mockPost,
      }));
      jest.mock('../src/github', () => ({
        ...jest.requireActual('../src/github'),
        appendSlackTsToDiscussion: mockAppend,
      }));
      require('../src/index');
    });

    await new Promise<void>((r) => setImmediate(r));

    expect(mockPost).toHaveBeenCalledTimes(1);
    const calledPayload = mockPost.mock.calls[0][2] as Record<string, unknown>;
    expect(calledPayload.thread_ts).toBeUndefined();
    expect(mockAppend).toHaveBeenCalledWith(
      NEVER_REAL_GITHUB_TOKEN,
      NEVER_REAL_DISCUSSION_NODE_ID,
      '1111111111.000001'
    );
  });
});
