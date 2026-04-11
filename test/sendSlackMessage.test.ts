/// <reference types="jest" />

import { EventEmitter } from 'events';
import https from 'https';

jest.mock('https', () => ({
  request: jest.fn(),
}));

import { sendSlackMessage, SlackPayload } from '../src/notifier';

const mockedRequest = https.request as jest.Mock;

function createMockReq(): EventEmitter & { write: jest.Mock; end: jest.Mock } {
  const req = new EventEmitter() as EventEmitter & { write: jest.Mock; end: jest.Mock };
  req.write = jest.fn();
  req.end = jest.fn();
  return req;
}

const testPayload: SlackPayload = {
  text: 'Hello',
  blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }],
};

describe('sendSlackMessage', () => {
  afterEach(() => {
    mockedRequest.mockReset();
  });

  it('should resolve on successful 2xx response', async () => {
    const req = createMockReq();
    mockedRequest.mockImplementation(
      (_options: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
        const res = Object.assign(new EventEmitter(), { statusCode: 200 });
        process.nextTick(() => {
          callback(res);
          res.emit('data', Buffer.from('ok'));
          res.emit('end');
        });
        return req;
      }
    );

    const result = await sendSlackMessage('https://hooks.slack.com/test', testPayload);
    expect(result).toBe('ok');
    expect(req.write).toHaveBeenCalledWith(JSON.stringify(testPayload));
    expect(req.end).toHaveBeenCalled();
  });

  it('should reject on non-2xx response', async () => {
    const req = createMockReq();
    mockedRequest.mockImplementation(
      (_options: unknown, callback: (res: EventEmitter & { statusCode: number }) => void) => {
        const res = Object.assign(new EventEmitter(), { statusCode: 500 });
        process.nextTick(() => {
          callback(res);
          res.emit('data', Buffer.from('internal_error'));
          res.emit('end');
        });
        return req;
      }
    );

    await expect(sendSlackMessage('https://hooks.slack.com/test', testPayload)).rejects.toThrow(
      /Slack webhook request failed: 500 internal_error/
    );
  });

  it('should reject on network error', async () => {
    const req = createMockReq();
    mockedRequest.mockImplementation(() => {
      process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
      return req;
    });

    await expect(sendSlackMessage('https://hooks.slack.com/test', testPayload)).rejects.toThrow(
      'ECONNREFUSED'
    );
  });
});
