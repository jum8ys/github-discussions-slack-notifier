/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

import fs from 'fs';
import os from 'os';
import path from 'path';

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

beforeEach(() => {
  process.env = { ...originalEnv };
  mockExit = jest.fn().mockImplementation((() => {
    throw new Error('process.exit');
  }) as () => never);
  process.exit = mockExit as unknown as typeof process.exit;
  consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
});

afterEach(() => {
  process.env = originalEnv;
  process.exit = originalExit;
  consoleSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('index.ts entrypoint', () => {
  it('should exit with 1 when SLACK_WEBHOOK_URL is missing', () => {
    delete process.env.INPUT_SLACK_WEBHOOK_URL;
    delete process.env.SLACK_WEBHOOK_URL;
    process.env.GITHUB_EVENT_PATH = '/tmp/dummy';

    expect(() => {
      jest.isolateModules(() => {
        require('../src/index');
      });
    }).toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing SLACK_WEBHOOK_URL')
    );
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
});
