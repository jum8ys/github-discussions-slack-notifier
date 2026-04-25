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
  SlackPayload,
  summarize,
} from '../src/notifier';

const NEVER_REAL_SLACK_ID_ALPHA = 'SLACK_ID_TEST_ONLY_NOT_REAL_ALPHA';
const NEVER_REAL_SLACK_ID_GAMMA = 'SLACK_ID_TEST_ONLY_NOT_REAL_GAMMA';
const NEVER_REAL_SLACK_ID_DELTA = 'SLACK_ID_TEST_ONLY_NOT_REAL_DELTA';
const NEVER_REAL_GH_USER_AUTHOR = '7f3a9c1e-4b2d-4e8f-9a1b-3c5d7e9f0a2b';
const NEVER_REAL_GH_USER_COMMENTER = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const NEVER_REAL_GH_USER_ANSWERER = 'c3d4e5f6-a7b8-9012-cdef-012345678912';
const NEVER_REAL_GH_USER_UNMAPPED = 'b9e1f2a3-c4d5-6789-ef01-234567890abc';
const NEVER_REAL_GH_USER_ALPHA = 'e4b97c52-1f3a-4d8e-b206-7a9c3f510d4e';
const NEVER_REAL_GH_USER_BETA = 'f5c08d63-2047-4e9f-8317-8b0d40621e5f';
const NEVER_REAL_GH_USER_EXTRA = 'a7d2e891-3b64-4c7f-9e52-1d0f8a293b7c';
const NEVER_REAL_GH_USER_DUP = 'b8e3f902-4c75-5d80-af63-2e109b304c8d';

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
    expect(result).toHaveLength(200);
    expect(result).toMatch(/\.\.\.$/);
  });

  it('should use 3000 as default limit', () => {
    const longText = 'a'.repeat(3100);
    const result = summarize(longText);
    expect(result).toHaveLength(3000);
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
    expect(result).toBe('ab...');
  });
});

// Test GitHub mention extraction
describe('extractGitHubMentions', () => {
  it('should extract single mention', () => {
    const text = `Hey @${NEVER_REAL_GH_USER_ALPHA}, can you review this?`;
    expect(extractGitHubMentions(text)).toEqual([NEVER_REAL_GH_USER_ALPHA]);
  });

  it('should extract multiple mentions', () => {
    const text = `@${NEVER_REAL_GH_USER_ALPHA} @${NEVER_REAL_GH_USER_BETA} @${NEVER_REAL_GH_USER_EXTRA} please weigh in`;
    expect(extractGitHubMentions(text)).toEqual([
      NEVER_REAL_GH_USER_ALPHA,
      NEVER_REAL_GH_USER_BETA,
      NEVER_REAL_GH_USER_EXTRA,
    ]);
  });

  it('should handle mentions with hyphens', () => {
    const text = `@${NEVER_REAL_GH_USER_ALPHA} @${NEVER_REAL_GH_USER_BETA} mentioned`;
    expect(extractGitHubMentions(text)).toEqual([
      NEVER_REAL_GH_USER_ALPHA,
      NEVER_REAL_GH_USER_BETA,
    ]);
  });

  it('should return empty array if no mentions', () => {
    const text = 'This is a comment without mentions';
    expect(extractGitHubMentions(text)).toEqual([]);
  });

  it('should not duplicate mentions', () => {
    const text = `@${NEVER_REAL_GH_USER_DUP} @${NEVER_REAL_GH_USER_DUP} again`;
    const mentions = extractGitHubMentions(text);
    expect(mentions).toEqual([NEVER_REAL_GH_USER_DUP]);
  });

  it('should not match email addresses', () => {
    const text = `Contact support@example.invalid or ping @${NEVER_REAL_GH_USER_ALPHA}`;
    expect(extractGitHubMentions(text)).toEqual([NEVER_REAL_GH_USER_ALPHA]);
  });
});

// Test discussion message building logic
describe('buildDiscussionMessage', () => {
  it('should include title, category, author, body, and link', async () => {
    const mappingPath = writeMappingFile({ [NEVER_REAL_GH_USER_ALPHA]: NEVER_REAL_SLACK_ID_ALPHA });
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test Discussion',
        body: `Hello @${NEVER_REAL_GH_USER_ALPHA} and welcome!`,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
        category: { name: 'General' },
      },
      mappingPath
    );
    const topBlocksText = JSON.stringify(result.blocks);
    const attachmentBlocksText = JSON.stringify(result.attachments![0].blocks);
    expect(result.attachments![0].color).toBe('#28A745');
    expect(result.text).toContain('Test Discussion');
    expect(topBlocksText).toContain('*New discussion created* (General)');
    expect(topBlocksText).toContain(
      `by <https://github.com/${NEVER_REAL_GH_USER_AUTHOR}|${NEVER_REAL_GH_USER_AUTHOR}>`
    );
    expect(topBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1|Test Discussion>'
    );
    // Slack mention appears outside the attachment
    expect(topBlocksText).toContain(`<@${NEVER_REAL_SLACK_ID_ALPHA}>`);
    // Body links GitHub mentions, not Slack mention format
    expect(attachmentBlocksText).toContain(
      `Hello <https://github.com/${NEVER_REAL_GH_USER_ALPHA}|@${NEVER_REAL_GH_USER_ALPHA}> and welcome!`
    );
    expect(attachmentBlocksText).not.toContain(`<@${NEVER_REAL_SLACK_ID_ALPHA}>`);
    expect(attachmentBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1|View discussion on GitHub>'
    );
  });

  it('should escape mrkdwn control characters in title, category, and body', async () => {
    const mappingPath = writeMappingFile({ [NEVER_REAL_GH_USER_ALPHA]: NEVER_REAL_SLACK_ID_ALPHA });
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Release <v3> & roadmap',
        body: `Ping <!channel> and @${NEVER_REAL_GH_USER_ALPHA} <script>alert(1)</script> & done`,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
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
    // Slack mention in outer blocks, GitHub mention linked in body
    expect(topBlocksText).toContain(`<@${NEVER_REAL_SLACK_ID_ALPHA}>`);
    expect(attachmentBlocksText).toContain(
      `Ping &lt;!channel&gt; and <https://github.com/${NEVER_REAL_GH_USER_ALPHA}|@${NEVER_REAL_GH_USER_ALPHA}> &lt;script&gt;alert(1)&lt;/script&gt; &amp; done`
    );
    expect(attachmentBlocksText).not.toContain(`<@${NEVER_REAL_SLACK_ID_ALPHA}>`);
  });

  it('should place Slack mentions in outer blocks even when body is truncated', async () => {
    const mappingPath = writeMappingFile({ [NEVER_REAL_GH_USER_ALPHA]: NEVER_REAL_SLACK_ID_ALPHA });
    // Mention is at the very end of a long body — would be cut off in the body text
    const longBody = 'x'.repeat(3100) + ` @${NEVER_REAL_GH_USER_ALPHA}`;
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body: longBody,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
      },
      mappingPath
    );
    const topBlocksText = JSON.stringify(result.blocks);
    const block = result.attachments![0].blocks[0] as { text: { text: string } };
    const bodyText = block.text.text;
    // Slack mention must appear in outer blocks
    expect(topBlocksText).toContain(`<@${NEVER_REAL_SLACK_ID_ALPHA}>`);
    // Body should be truncated within limit and not contain Slack mention format
    expect(bodyText.length).toBeLessThanOrEqual(3000);
    expect(bodyText).not.toContain(`<@${NEVER_REAL_SLACK_ID_ALPHA}>`);
  });

  it('should deduplicate Slack mentions in outer blocks', async () => {
    const mappingPath = writeMappingFile({ [NEVER_REAL_GH_USER_ALPHA]: NEVER_REAL_SLACK_ID_ALPHA });
    const body = `@${NEVER_REAL_GH_USER_ALPHA} hello @${NEVER_REAL_GH_USER_ALPHA} again`;
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
      },
      mappingPath
    );
    const topBlocksText = JSON.stringify(result.blocks);
    // Each Slack mention should appear only once in outer blocks
    const mentionMatches =
      topBlocksText.match(new RegExp(`<@${NEVER_REAL_SLACK_ID_ALPHA}>`, 'g')) ?? [];
    expect(mentionMatches.length).toBe(1);
  });

  it('should link GitHub mentions in body text', async () => {
    const mappingPath = writeMappingFile({ [NEVER_REAL_GH_USER_ALPHA]: NEVER_REAL_SLACK_ID_ALPHA });
    const filler = 'x'.repeat(100);
    const body = `${filler} @${NEVER_REAL_GH_USER_ALPHA} extra text after`;
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
      },
      mappingPath
    );
    const block = result.attachments![0].blocks[0] as { text: { text: string } };
    const bodyText = block.text.text;
    expect(bodyText).toContain(
      `<https://github.com/${NEVER_REAL_GH_USER_ALPHA}|@${NEVER_REAL_GH_USER_ALPHA}>`
    );
    expect(bodyText).not.toContain(`<@${NEVER_REAL_SLACK_ID_ALPHA}>`);
  });

  it('should not break mrkdwn mention link when truncation falls inside it', async () => {
    const mappingPath = writeMappingFile({});
    // Place the mention so its expanded link form spans the 3000-char truncation boundary.
    // The link for NEVER_REAL_GH_USER_ALPHA is ~95 chars; a 2950-char prefix puts its
    // start just inside the truncation window so it would be cut in the middle.
    const body = `${'x'.repeat(2950)} @${NEVER_REAL_GH_USER_ALPHA} trailing text`;
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
      },
      mappingPath
    );
    const block = result.attachments![0].blocks[0] as { text: { text: string } };
    const bodyText = block.text.text;
    expect(bodyText.length).toBeLessThanOrEqual(3000);
    // Every '<' must have a matching '>' — no incomplete mrkdwn link
    expect(bodyText).not.toMatch(/<[^>]*$/);
  });

  it('should truncate long body without mentions to within 3000 chars', async () => {
    const mappingPath = writeMappingFile({});
    const longBody = 'x'.repeat(3100); // no mentions
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body: longBody,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
      },
      mappingPath
    );
    const block = result.attachments![0].blocks[0] as { text: { text: string } };
    expect(block.text.text.length).toBeLessThanOrEqual(3000);
  });

  it('should place many mentions in outer blocks without affecting body limit', async () => {
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
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
      },
      mappingPath
    );
    // Body is within limit (GitHub mentions linked, not Slack)
    const block = result.attachments![0].blocks[0] as { text: { text: string } };
    expect(block.text.text.length).toBeLessThanOrEqual(3000);
    // Slack mentions are in outer blocks
    const topBlocksText = JSON.stringify(result.blocks);
    expect(topBlocksText).toContain('<@SLACKID0000TEST>');
  });

  it('should show mapped mentions as Slack and unmapped as GitHub in outer blocks', async () => {
    const mappingPath = writeMappingFile({ [NEVER_REAL_GH_USER_ALPHA]: NEVER_REAL_SLACK_ID_ALPHA });
    const result: SlackPayload = await buildDiscussionMessage(
      {
        title: 'Test',
        body: `@${NEVER_REAL_GH_USER_ALPHA} and @${NEVER_REAL_GH_USER_UNMAPPED} please review`,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1',
        user: { login: NEVER_REAL_GH_USER_AUTHOR },
      },
      mappingPath
    );
    const topBlocksText = JSON.stringify(result.blocks);
    const attachmentBlocksText = JSON.stringify(result.attachments![0].blocks);
    // Mapped → Slack mention, unmapped → GitHub profile link, both in outer blocks
    expect(topBlocksText).toContain(`<@${NEVER_REAL_SLACK_ID_ALPHA}>`);
    expect(topBlocksText).toContain(
      `<https://github.com/${NEVER_REAL_GH_USER_UNMAPPED}|${NEVER_REAL_GH_USER_UNMAPPED}>`
    );
    // Both are linked as GitHub profile links in the body
    expect(attachmentBlocksText).toContain(
      `<https://github.com/${NEVER_REAL_GH_USER_ALPHA}|@${NEVER_REAL_GH_USER_ALPHA}>`
    );
    expect(attachmentBlocksText).toContain(
      `<https://github.com/${NEVER_REAL_GH_USER_UNMAPPED}|@${NEVER_REAL_GH_USER_UNMAPPED}>`
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
    const mappingPath = writeMappingFile({
      [NEVER_REAL_GH_USER_COMMENTER]: NEVER_REAL_SLACK_ID_DELTA,
    });
    const result: SlackPayload = await buildCommentMessage(
      {
        body: `Test comment by @${NEVER_REAL_GH_USER_COMMENTER}`,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-2',
        user: { login: NEVER_REAL_GH_USER_COMMENTER },
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
    expect(topBlocksText).toContain(
      `by <https://github.com/${NEVER_REAL_GH_USER_COMMENTER}|${NEVER_REAL_GH_USER_COMMENTER}>`
    );
    expect(topBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1|Discussion Title>'
    );
    // Slack mention in outer blocks, GitHub mention linked in body
    expect(topBlocksText).toContain(`<@${NEVER_REAL_SLACK_ID_DELTA}>`);
    expect(attachmentBlocksText).toContain(
      `Test comment by <https://github.com/${NEVER_REAL_GH_USER_COMMENTER}|@${NEVER_REAL_GH_USER_COMMENTER}>`
    );
    expect(attachmentBlocksText).not.toContain(`<@${NEVER_REAL_SLACK_ID_DELTA}>`);
    expect(attachmentBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-2|View comment on GitHub>'
    );
  });

  it('should escape mrkdwn control characters in title and body', async () => {
    const mappingPath = writeMappingFile({
      [NEVER_REAL_GH_USER_COMMENTER]: NEVER_REAL_SLACK_ID_DELTA,
    });
    const result: SlackPayload = await buildCommentMessage(
      {
        body: `Escalate <!here> @${NEVER_REAL_GH_USER_COMMENTER} & review`,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-2',
        user: { login: NEVER_REAL_GH_USER_COMMENTER },
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
    // Slack mention in outer blocks, GitHub mention linked in body
    expect(topBlocksText).toContain(`<@${NEVER_REAL_SLACK_ID_DELTA}>`);
    expect(attachmentBlocksText).toContain(
      `Escalate &lt;!here&gt; <https://github.com/${NEVER_REAL_GH_USER_COMMENTER}|@${NEVER_REAL_GH_USER_COMMENTER}> &amp; review`
    );
    expect(attachmentBlocksText).not.toContain(`<@${NEVER_REAL_SLACK_ID_DELTA}>`);
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
    const mappingPath = writeMappingFile({
      [NEVER_REAL_GH_USER_ANSWERER]: NEVER_REAL_SLACK_ID_GAMMA,
    });
    const result: SlackPayload = await buildAnsweredMessage(
      {
        body: `This solves it @${NEVER_REAL_GH_USER_ANSWERER}`,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-3',
        user: { login: NEVER_REAL_GH_USER_ANSWERER },
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
    expect(topBlocksText).toContain(
      `answered by <https://github.com/${NEVER_REAL_GH_USER_ANSWERER}|${NEVER_REAL_GH_USER_ANSWERER}>`
    );
    expect(topBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1|How to do X?>'
    );
    // Slack mention in outer blocks, GitHub mention linked in body
    expect(topBlocksText).toContain(`<@${NEVER_REAL_SLACK_ID_GAMMA}>`);
    expect(attachmentBlocksText).toContain(
      `This solves it <https://github.com/${NEVER_REAL_GH_USER_ANSWERER}|@${NEVER_REAL_GH_USER_ANSWERER}>`
    );
    expect(attachmentBlocksText).not.toContain(`<@${NEVER_REAL_SLACK_ID_GAMMA}>`);
    expect(attachmentBlocksText).toContain(
      '<https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-3|View answer on GitHub>'
    );
  });

  it('should escape mrkdwn control characters in title, category, and body', async () => {
    const mappingPath = writeMappingFile({
      [NEVER_REAL_GH_USER_ANSWERER]: NEVER_REAL_SLACK_ID_GAMMA,
    });
    const result: SlackPayload = await buildAnsweredMessage(
      {
        body: `Done <!channel> @${NEVER_REAL_GH_USER_ANSWERER} & closed`,
        html_url: 'https://github.invalid/test-org/test-repo/discussions/1#discussioncomment-3',
        user: { login: NEVER_REAL_GH_USER_ANSWERER },
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
    // Slack mention in outer blocks, GitHub mention linked in body
    expect(topBlocksText).toContain(`<@${NEVER_REAL_SLACK_ID_GAMMA}>`);
    expect(attachmentBlocksText).toContain(
      `Done &lt;!channel&gt; <https://github.com/${NEVER_REAL_GH_USER_ANSWERER}|@${NEVER_REAL_GH_USER_ANSWERER}> &amp; closed`
    );
    expect(attachmentBlocksText).not.toContain(`<@${NEVER_REAL_SLACK_ID_GAMMA}>`);
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
