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

const NEVER_REAL_SLACK_ID_ALPHA = 'SLACK_ID_TEST_ONLY_NOT_REAL_ALPHA';
const NEVER_REAL_SLACK_ID_BETA = 'SLACK_ID_TEST_ONLY_NOT_REAL_BETA';
const NEVER_REAL_SLACK_ID_GAMMA = 'SLACK_ID_TEST_ONLY_NOT_REAL_GAMMA';
const NEVER_REAL_SLACK_ID_DELTA = 'SLACK_ID_TEST_ONLY_NOT_REAL_DELTA';
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

  it('should use 3000 as default limit', () => {
    const longText = 'a'.repeat(3100);
    const result = summarize(longText);
    expect(result).toHaveLength(3003); // 3000 + '...'
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
    const text = 'Hey @test-user-alpha, can you review this?';
    expect(extractGitHubMentions(text)).toEqual(['test-user-alpha']);
  });

  it('should extract multiple mentions', () => {
    const text = '@test-user-alpha @test-user-beta @test-user-gamma please weigh in';
    expect(extractGitHubMentions(text)).toEqual([
      'test-user-alpha',
      'test-user-beta',
      'test-user-gamma',
    ]);
  });

  it('should handle mentions with underscores and hyphens', () => {
    const text = '@test_user_one @test-user-two mentioned';
    expect(extractGitHubMentions(text)).toEqual(['test_user_one', 'test-user-two']);
  });

  it('should return empty array if no mentions', () => {
    const text = 'This is a comment without mentions';
    expect(extractGitHubMentions(text)).toEqual([]);
  });

  it('should not duplicate mentions', () => {
    const text = '@test-user-dup @test-user-dup again';
    const mentions = extractGitHubMentions(text);
    expect(mentions).toEqual(['test-user-dup']);
  });

  it('should not match email addresses', () => {
    const text = 'Contact support@example.invalid or ping @test-user-alpha';
    expect(extractGitHubMentions(text)).toEqual(['test-user-alpha']);
  });
});

describe('resolveMentionsToSlack', () => {
  it('should convert mapped mentions', async () => {
    const mappingPath = writeMappingFile({ 'test-user-alpha': NEVER_REAL_SLACK_ID_ALPHA });
    const result = await resolveMentionsToSlack('Hi @test-user-alpha', mappingPath);
    expect(result).toBe(`Hi <@${NEVER_REAL_SLACK_ID_ALPHA}>`);
  });

  it('should convert mentions from inline mapping JSON', async () => {
    const result = await resolveMentionsToSlack('Hi @test-user-alpha', {
      json: `{"test-user-alpha":"${NEVER_REAL_SLACK_ID_BETA}"}`,
    });
    expect(result).toBe(`Hi <@${NEVER_REAL_SLACK_ID_BETA}>`);
  });

  it('should prioritize inline mapping JSON over mapping file', async () => {
    const mappingPath = writeMappingFile({ 'test-user-alpha': NEVER_REAL_SLACK_ID_ALPHA });
    const result = await resolveMentionsToSlack('Hi @test-user-alpha', {
      filePath: mappingPath,
      json: `{"test-user-alpha":"${NEVER_REAL_SLACK_ID_BETA}"}`,
    });
    expect(result).toBe(`Hi <@${NEVER_REAL_SLACK_ID_BETA}>`);
  });

  it('should keep unmapped mentions as-is', async () => {
    const mappingPath = writeMappingFile({ 'test-user-alpha': NEVER_REAL_SLACK_ID_GAMMA });
    const result = await resolveMentionsToSlack('Hi @test-user-beta', mappingPath);
    expect(result).toBe('Hi @test-user-beta');
  });
});

// Test discussion message building logic
describe('buildDiscussionMessage', () => {
  it('should include title, category, author, body, and link', async () => {
    const mappingPath = writeMappingFile({ 'test-user-alpha': NEVER_REAL_SLACK_ID_ALPHA });
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test Discussion',
        body: 'Hello @test-user-alpha and welcome!',
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
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
      '<https://github.invalid/test-org/test-repo/discussions/1|Test Discussion>'
    );
    expect(attachmentBlocksText).toContain(`Hello <@${NEVER_REAL_SLACK_ID_ALPHA}> and welcome!`);
    expect(attachmentBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1|View discussion on GitHub>'
    );
  });

  it('should escape mrkdwn control characters in title, category, and body', async () => {
    const mappingPath = writeMappingFile({ 'test-user-alpha': NEVER_REAL_SLACK_ID_ALPHA });
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Release <v3> & roadmap',
        body: 'Ping <!channel> and @test-user-alpha <script>alert(1)</script> & done',
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: 'testuser' },
        category: { name: 'General <all>' },
      },
      mappingPath
    );

    const topBlocksText = JSON.stringify(result.blocks);
    const attachmentBlocksText = JSON.stringify(result.attachments![0].blocks);
    expect(topBlocksText).toContain('*New discussion created* (General &lt;all&gt;)');
    expect(topBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1|Release &lt;v3&gt; &amp; roadmap>'
    );
    expect(attachmentBlocksText).toContain(
      `Ping &lt;!channel&gt; and <@${NEVER_REAL_SLACK_ID_ALPHA}> &lt;script&gt;alert(1)&lt;/script&gt; &amp; done`
    );
  });

  it('should place all mentions at the top even when body is truncated', async () => {
    const mappingPath = writeMappingFile({ 'test-user-alpha': NEVER_REAL_SLACK_ID_ALPHA });
    // Mention is at the very end of a long body — would be cut off without prefix logic
    const longBody = 'x'.repeat(3100) + ' @test-user-alpha';
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body: longBody,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: 'testuser' },
      },
      mappingPath
    );
    const block = result.attachments![0].blocks[0] as { text: { text: string } };
    const bodyText = block.text.text;
    // Mention must appear at the very start
    expect(bodyText.startsWith(`<@${NEVER_REAL_SLACK_ID_ALPHA}>\n`)).toBe(true);
    expect(bodyText.length).toBeLessThanOrEqual(3000);
  });

  it('should deduplicate mentions in the prefix', async () => {
    const mappingPath = writeMappingFile({ 'test-user-alpha': NEVER_REAL_SLACK_ID_ALPHA });
    const body = '@test-user-alpha hello @test-user-alpha again';
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: 'testuser' },
      },
      mappingPath
    );
    const block = result.attachments![0].blocks[0] as { text: { text: string } };
    const bodyText = block.text.text;
    const prefixLine = bodyText.split('\n')[0];
    // The prefix should list each mention only once
    const mentionMatches = prefixLine.match(/<@\w+>/g) ?? [];
    const uniqueMentions = new Set(mentionMatches);
    expect(mentionMatches.length).toBe(uniqueMentions.size);
  });

  it('should not split a Slack mention token at the truncation boundary', async () => {
    const mappingPath = writeMappingFile({ 'test-user-alpha': NEVER_REAL_SLACK_ID_ALPHA });
    // Place a mention so it straddles the truncation boundary
    const filler = 'x'.repeat(2990);
    const body = filler + '@test-user-alpha extra text after';
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: 'testuser' },
      },
      mappingPath
    );
    const block = result.attachments![0].blocks[0] as { text: { text: string } };
    const bodyText = block.text.text;
    expect(bodyText).not.toMatch(/<@[^>]+$/);
    expect(bodyText.length).toBeLessThanOrEqual(3000);
  });

  it('should truncate long body without mentions to within 3000 chars', async () => {
    const mappingPath = writeMappingFile({});
    const longBody = 'x'.repeat(3100); // no mentions
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body: longBody,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: 'testuser' },
      },
      mappingPath
    );
    const block = result.attachments![0].blocks[0] as { text: { text: string } };
    expect(block.text.text.length).toBeLessThanOrEqual(3000);
  });

  it('should stay within 3000 chars even when many mentions fill the prefix', async () => {
    // Create 300 unique users — their prefix would exceed 3000 chars on its own
    const mapping: Record<string, string> = {};
    const body = Array.from({ length: 300 }, (_, i) => {
      const user = `user-${i}`;
      mapping[user] = `SLACKID${String(i).padStart(4, '0')}TEST`;
      return `@${user}`;
    }).join(' ');
    const mappingPath = writeMappingFile(mapping);
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: 'testuser' },
      },
      mappingPath
    );
    const block = result.attachments![0].blocks[0] as { text: { text: string } };
    expect(block.text.text.length).toBeLessThanOrEqual(3000);
  });

  it.each([
    { bodyBudget: 1, slackIdLength: 2995 },
    { bodyBudget: 2, slackIdLength: 2994 },
  ])(
    'should stay within 3000 chars when mention prefix leaves only $bodyBudget char budget',
    async ({ slackIdLength }) => {
      const longSlackId = 'A'.repeat(slackIdLength);
      const mappingPath = writeMappingFile({ 'test-user-alpha': longSlackId });
      const result: SlackPayload = await buildDiscussionMessage(
        {
          title: 'Test',
          body: `@test-user-alpha ${'x'.repeat(4000)}`,
          html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
          user: { login: 'testuser' },
        },
        mappingPath
      );
      const block = result.attachments![0].blocks[0] as { text: { text: string } };
      expect(block.text.text.length).toBeLessThanOrEqual(3000);
    }
  );

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
    const mappingPath = writeMappingFile({ commenter: NEVER_REAL_SLACK_ID_DELTA });
    const result: SlackPayload = await buildCommentMessage(
      {
        body: 'Test comment by @commenter',
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-2',
        user: { login: 'commenter' },
        created_at: '2024-01-01T12:00:00Z',
      },
      {
        title: 'Discussion Title',
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
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
      '<https://github.invalid/test-org/test-repo/discussions/1|Discussion Title>'
    );
    expect(attachmentBlocksText).toContain(`Test comment by <@${NEVER_REAL_SLACK_ID_DELTA}>`);
    expect(attachmentBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-2|View comment on GitHub>'
    );
  });

  it('should escape mrkdwn control characters in title and body', async () => {
    const mappingPath = writeMappingFile({ commenter: NEVER_REAL_SLACK_ID_DELTA });
    const result: SlackPayload = await buildCommentMessage(
      {
        body: 'Escalate <!here> @commenter & review',
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-2',
        user: { login: 'commenter' },
      },
      {
        title: 'Topic <urgent> & needs-help',
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
      },
      mappingPath
    );

    const topBlocksText = JSON.stringify(result.blocks);
    const attachmentBlocksText = JSON.stringify(result.attachments![0].blocks);
    expect(topBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1|Topic &lt;urgent&gt; &amp; needs-help>'
    );
    expect(attachmentBlocksText).toContain(
      `Escalate &lt;!here&gt; <@${NEVER_REAL_SLACK_ID_DELTA}> &amp; review`
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
    const mappingPath = writeMappingFile({ answerer: NEVER_REAL_SLACK_ID_GAMMA });
    const result: SlackPayload = await buildAnsweredMessage(
      {
        body: 'This solves it @answerer',
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-3',
        user: { login: 'answerer' },
      },
      {
        title: 'How to do X?',
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        category: { name: 'Q&A' },
      },
      mappingPath
    );
    const topBlocksText = JSON.stringify(result.blocks);
    const attachmentBlocksText = JSON.stringify(result.attachments![0].blocks);
    expect(result.attachments![0].color).toBe('#F6B73C');
    expect(result.text).toContain('How to do X?');
    expect(topBlocksText).toContain('*Discussion answered* (Q&amp;A)');
    expect(topBlocksText).toContain('answered by <https://github.com/answerer|answerer>');
    expect(topBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1|How to do X?>'
    );
    expect(attachmentBlocksText).toContain(`This solves it <@${NEVER_REAL_SLACK_ID_GAMMA}>`);
    expect(attachmentBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-3|View answer on GitHub>'
    );
  });

  it('should escape mrkdwn control characters in title, category, and body', async () => {
    const mappingPath = writeMappingFile({ answerer: NEVER_REAL_SLACK_ID_GAMMA });
    const result: SlackPayload = await buildAnsweredMessage(
      {
        body: 'Done <!channel> @answerer & closed',
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-3',
        user: { login: 'answerer' },
      },
      {
        title: 'How <X> works & why',
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        category: { name: 'Q&A <public>' },
      },
      mappingPath
    );

    const topBlocksText = JSON.stringify(result.blocks);
    const attachmentBlocksText = JSON.stringify(result.attachments![0].blocks);
    expect(topBlocksText).toContain('*Discussion answered* (Q&amp;A &lt;public&gt;)');
    expect(topBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1|How &lt;X&gt; works &amp; why>'
    );
    expect(attachmentBlocksText).toContain(
      `Done &lt;!channel&gt; <@${NEVER_REAL_SLACK_ID_GAMMA}> &amp; closed`
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
