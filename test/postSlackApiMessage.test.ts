/// <reference types="jest" />

import { EventEmitter } from 'events';
import https from 'https';

jest.mock('https', () => ({
  request: jest.fn(),
}));

import { postSlackApiMessage, SlackPayload } from '../src/notifier';

const mockedRequest = https.request as jest.Mock;

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

const NEVER_REAL_SLACK_BOT_TOKEN = 'xoxb-NEVER-REAL-TEST-TOKEN';
const NEVER_REAL_SLACK_CHANNEL_ID = 'CNEVER_REAL_TEST_CHANNEL_0';

const testPayload: SlackPayload = {
  text: 'New discussion',
  blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }],
};

describe('postSlackApiMessage', () => {
  afterEach(() => {
    mockedRequest.mockReset();
  });

  it('should resolve with ts on successful response', async () => {
    const req = createMockReq();
    mockedRequest.mockImplementation(
      (_options: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
        const res = Object.assign(new EventEmitter(), { statusCode: 200 });
        process.nextTick(() => {
          callback(res);
          res.emit('data', Buffer.from(JSON.stringify({ ok: true, ts: '1234567890.123456' })));
          res.emit('end');
        });
        return req;
      }
    );

    const result = await postSlackApiMessage(
      NEVER_REAL_SLACK_BOT_TOKEN,
      NEVER_REAL_SLACK_CHANNEL_ID,
      testPayload
    );
    expect(result).toBe('1234567890.123456');
  });

  it('should include Authorization header and channel in request body', async () => {
    const req = createMockReq();
    let capturedOptions: https.RequestOptions | undefined;
    let capturedBody: string | undefined;

    mockedRequest.mockImplementation(
      (
        options: https.RequestOptions,
        callback: (res: EventEmitter & { statusCode: number }) => void
      ) => {
        capturedOptions = options;
        const res = Object.assign(new EventEmitter(), { statusCode: 200 });
        process.nextTick(() => {
          callback(res);
          res.emit('data', Buffer.from(JSON.stringify({ ok: true, ts: '111.222' })));
          res.emit('end');
        });
        return req;
      }
    );
    req.write.mockImplementation((body: string) => {
      capturedBody = body;
    });

    await postSlackApiMessage(NEVER_REAL_SLACK_BOT_TOKEN, NEVER_REAL_SLACK_CHANNEL_ID, testPayload);

    expect((capturedOptions?.headers as Record<string, string>)?.Authorization).toBe(
      `Bearer ${NEVER_REAL_SLACK_BOT_TOKEN}`
    );
    const parsedBody = JSON.parse(capturedBody ?? '{}') as Record<string, unknown>;
    expect(parsedBody.channel).toBe(NEVER_REAL_SLACK_CHANNEL_ID);
  });

  it('should reject when Slack API returns ok: false', async () => {
    const req = createMockReq();
    mockedRequest.mockImplementation(
      (_options: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
        const res = Object.assign(new EventEmitter(), { statusCode: 200 });
        process.nextTick(() => {
          callback(res);
          res.emit('data', Buffer.from(JSON.stringify({ ok: false, error: 'not_in_channel' })));
          res.emit('end');
        });
        return req;
      }
    );

    await expect(
      postSlackApiMessage(NEVER_REAL_SLACK_BOT_TOKEN, NEVER_REAL_SLACK_CHANNEL_ID, testPayload)
    ).rejects.toThrow('Slack API error: not_in_channel');
  });

  it('should reject on non-2xx HTTP status', async () => {
    const req = createMockReq();
    mockedRequest.mockImplementation(
      (_options: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
        const res = Object.assign(new EventEmitter(), { statusCode: 500 });
        process.nextTick(() => {
          callback(res);
          res.emit('data', Buffer.from('internal_server_error'));
          res.emit('end');
        });
        return req;
      }
    );

    await expect(
      postSlackApiMessage(NEVER_REAL_SLACK_BOT_TOKEN, NEVER_REAL_SLACK_CHANNEL_ID, testPayload)
    ).rejects.toThrow(/Slack API request failed: 500/);
  });

  it('should reject when 2xx response body is not valid JSON', async () => {
    const req = createMockReq();
    mockedRequest.mockImplementation(
      (_options: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
        const res = Object.assign(new EventEmitter(), { statusCode: 200 });
        process.nextTick(() => {
          callback(res);
          res.emit('data', Buffer.from('<html>not json</html>'));
          res.emit('end');
        });
        return req;
      }
    );

    await expect(
      postSlackApiMessage(NEVER_REAL_SLACK_BOT_TOKEN, NEVER_REAL_SLACK_CHANNEL_ID, testPayload)
    ).rejects.toThrow(/Failed to parse Slack API response/);
  });

  it('should reject on network error', async () => {
    const req = createMockReq();
    mockedRequest.mockImplementation(() => {
      process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
      return req;
    });

    await expect(
      postSlackApiMessage(NEVER_REAL_SLACK_BOT_TOKEN, NEVER_REAL_SLACK_CHANNEL_ID, testPayload)
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('should include thread_ts and reply_broadcast when set in payload', async () => {
    const req = createMockReq();
    let capturedBody: string | undefined;

    mockedRequest.mockImplementation(
      (_options: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
        const res = Object.assign(new EventEmitter(), { statusCode: 200 });
        process.nextTick(() => {
          callback(res);
          res.emit('data', Buffer.from(JSON.stringify({ ok: true, ts: '999.000' })));
          res.emit('end');
        });
        return req;
      }
    );
    req.write.mockImplementation((body: string) => {
      capturedBody = body;
    });

    const threadPayload: SlackPayload = {
      ...testPayload,
      thread_ts: '1111111111.000001',
      reply_broadcast: true,
    };
    await postSlackApiMessage(
      NEVER_REAL_SLACK_BOT_TOKEN,
      NEVER_REAL_SLACK_CHANNEL_ID,
      threadPayload
    );

    const parsed = JSON.parse(capturedBody ?? '{}') as Record<string, unknown>;
    expect(parsed.thread_ts).toBe('1111111111.000001');
    expect(parsed.reply_broadcast).toBe(true);
  });
});
