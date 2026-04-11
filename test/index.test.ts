/// <reference types="node" />
/// <reference types="jest" />

import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  buildAnsweredMessage,
  buildCommentMessage,
  buildDiscussionMessage,
  extractGitHubMentions,
  resolveMentionsToSlack,
  SlackPayload,
  summarize,
} from '../src/notifier';
function writeMappingFile(mapping: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdsn-'));
  const mappingPath = path.join(tmpDir, 'mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify(mapping), 'utf8');
  return mappingPath;
}

// Test summarize function
describe('summarize', () => {
  it('should return empty string for undefined', () => {
    expect(summarize(undefined)).toBe('');
  });

  it('should return empty string for empty text', () => {
    expect(summarize('')).toBe('');
  });

  it('should return trimmed text when under limit', () => {
    const text = '  Hello world  ';
    expect(summarize(text)).toBe('Hello world');
  });

  it('should truncate and add ellipsis when over limit', () => {
    const longText = 'a'.repeat(250);
    const result = summarize(longText, 200);
    expect(result).toHaveLength(203); // 200 + '...'
    expect(result).toMatch(/\.\.\.$/);
  });

  it('should normalize line breaks', () => {
    const text = 'Line 1\r\nLine 2\r\nLine 3';
    const result = summarize(text);
    expect(result).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should handle custom limit', () => {
    const text = 'abcdefghij';
    const result = summarize(text, 5);
    expect(result).toBe('abcde...');
  });
});

// Test GitHub mention extraction
describe('extractGitHubMentions', () => {
  it('should extract single mention', () => {
    const text = 'Hey @john-doe, can you review this?';
    expect(extractGitHubMentions(text)).toEqual(['john-doe']);
  });

  it('should extract multiple mentions', () => {
    const text = '@alice @bob @charlie please weigh in';
    expect(extractGitHubMentions(text)).toEqual(['alice', 'bob', 'charlie']);
  });

  it('should handle mentions with underscores and hyphens', () => {
    const text = '@john_doe @jane-smith mentioned';
    expect(extractGitHubMentions(text)).toEqual(['john_doe', 'jane-smith']);
  });

  it('should return empty array if no mentions', () => {
    const text = 'This is a comment without mentions';
    expect(extractGitHubMentions(text)).toEqual([]);
  });

  it('should not duplicate mentions', () => {
    const text = '@john @john again';
    const mentions = extractGitHubMentions(text);
    expect(mentions).toEqual(['john']);
  });
});

describe('resolveMentionsToSlack', () => {
  it('should convert mapped mentions', async () => {
    const mappingPath = writeMappingFile({ 'john-doe': 'U12345678' });
    const result = await resolveMentionsToSlack('Hi @john-doe', mappingPath);
    expect(result).toBe('Hi <@U12345678>');
  });

  it('should keep unmapped mentions as-is', async () => {
    const mappingPath = writeMappingFile({ alice: 'U11111111' });
    const result = await resolveMentionsToSlack('Hi @bob', mappingPath);
    expect(result).toBe('Hi @bob');
  });
});

// Test discussion message building logic
describe('buildDiscussionMessage', () => {
  it('should include title, category, author, body, and link', async () => {
    const mappingPath = writeMappingFile({ 'john-doe': 'U12345678' });
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test Discussion',
        body: 'Hello @john-doe and welcome!',
        html_url: 'https://github.com/org/repo/discussions/123',
        user: { login: 'testuser' },
        category: { name: 'General' },
        created_at: '2024-01-01T00:00:00Z',
      },
      mappingPath
    );
    const topBlocksText = JSON.stringify(result.blocks);
    const attachmentBlocksText = JSON.stringify(result.attachments![0].blocks);
    expect(result.attachments![0].color).toBe('#28A745');
    expect(result.text).toContain('Test Discussion');
    expect(topBlocksText).toContain('*New discussion created* (General)');
    expect(topBlocksText).toContain('by <https://github.com/testuser|testuser>');
    expect(topBlocksText).toContain(
      '<https://github.com/org/repo/discussions/123|Test Discussion>'
    );
    expect(attachmentBlocksText).toContain('Hello <@U12345678> and welcome!');
    expect(attachmentBlocksText).toContain(
      '<https://github.com/org/repo/discussions/123|View discussion on GitHub>'
    );
  });

  it('should use fallback values when fields are missing', async () => {
    const mappingPath = writeMappingFile({});
    const result: SlackPayload = await buildDiscussionMessage({}, mappingPath);
    const blocksText = JSON.stringify(result.blocks);
    expect(blocksText).toContain('*New discussion created*');
    expect(blocksText).toContain('by <https://github.com/unknown|unknown>');
    expect(blocksText).toContain('No title');
    expect(blocksText).not.toContain('View discussion on GitHub');
    expect(result.attachments).toBeUndefined();
  });
});

// Test comment message building logic
describe('buildCommentMessage', () => {
  it('should include discussion title, author, body, and link', async () => {
    const mappingPath = writeMappingFile({ commenter: 'U99999999' });
    const result: SlackPayload = await buildCommentMessage(
      {
        body: 'Test comment by @commenter',
        html_url: 'https://github.com/org/repo/discussions/123#discussioncomment-456',
        user: { login: 'commenter' },
        created_at: '2024-01-01T12:00:00Z',
      },
      {
        title: 'Discussion Title',
        html_url: 'https://github.com/org/repo/discussions/123',
      },
      mappingPath
    );
    const topBlocksText = JSON.stringify(result.blocks);
    const attachmentBlocksText = JSON.stringify(result.attachments![0].blocks);
    expect(result.attachments![0].color).toBe('#0075DB');
    expect(result.text).toContain('Discussion Title');
    expect(topBlocksText).toContain('*New discussion comment*');
    expect(topBlocksText).toContain('by <https://github.com/commenter|commenter>');
    expect(topBlocksText).toContain(
      '<https://github.com/org/repo/discussions/123|Discussion Title>'
    );
    expect(attachmentBlocksText).toContain('Test comment by <@U99999999>');
    expect(attachmentBlocksText).toContain(
      '<https://github.com/org/repo/discussions/123#discussioncomment-456|View comment on GitHub>'
    );
  });

  it('should use fallback values when fields are missing', async () => {
    const mappingPath = writeMappingFile({});
    const result: SlackPayload = await buildCommentMessage({}, {}, mappingPath);
    const blocksText = JSON.stringify(result.blocks);
    expect(blocksText).toContain('*New discussion comment*');
    expect(blocksText).toContain('by <https://github.com/unknown|unknown>');
    expect(blocksText).toContain('No title');
    expect(blocksText).not.toContain('View comment on GitHub');
    expect(result.attachments).toBeUndefined();
  });
});

// Test answered message building logic
describe('buildAnsweredMessage', () => {
  it('should include discussion title, answerer, body, and link', async () => {
    const mappingPath = writeMappingFile({ answerer: 'U77777777' });
    const result: SlackPayload = await buildAnsweredMessage(
      {
        body: 'This solves it @answerer',
        html_url: 'https://github.com/org/repo/discussions/123#discussioncomment-789',
        user: { login: 'answerer' },
      },
      {
        title: 'How to do X?',
        html_url: 'https://github.com/org/repo/discussions/123',
        category: { name: 'Q&A' },
      },
      mappingPath
    );
    const topBlocksText = JSON.stringify(result.blocks);
    const attachmentBlocksText = JSON.stringify(result.attachments![0].blocks);
    expect(result.attachments![0].color).toBe('#F6B73C');
    expect(result.text).toContain('How to do X?');
    expect(topBlocksText).toContain('*Discussion answered* (Q&A)');
    expect(topBlocksText).toContain('answered by <https://github.com/answerer|answerer>');
    expect(topBlocksText).toContain('<https://github.com/org/repo/discussions/123|How to do X?>');
    expect(attachmentBlocksText).toContain('This solves it <@U77777777>');
    expect(attachmentBlocksText).toContain(
      '<https://github.com/org/repo/discussions/123#discussioncomment-789|View answer on GitHub>'
    );
  });

  it('should use fallback values when fields are missing', async () => {
    const mappingPath = writeMappingFile({});
    const result: SlackPayload = await buildAnsweredMessage({}, {}, mappingPath);
    const blocksText = JSON.stringify(result.blocks);
    expect(blocksText).toContain('*Discussion answered*');
    expect(blocksText).toContain('answered by <https://github.com/unknown|unknown>');
    expect(blocksText).toContain('No title');
    expect(blocksText).not.toContain('View answer on GitHub');
    expect(result.attachments).toBeUndefined();
  });
});
