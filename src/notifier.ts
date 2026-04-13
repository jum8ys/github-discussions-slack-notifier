import fs from 'fs';
import https from 'https';
import { URL } from 'url';

export interface User {
  login?: string;
}

export interface Category {
  name?: string;
}

export interface Discussion {
  title?: string;
  body?: string;
  body_text?: string;
  html_url?: string;
  url?: string;
  user?: User;
  category?: Category;
  created_at?: string;
  published_at?: string;
}

export interface Comment {
  body?: string;
  body_text?: string;
  html_url?: string;
  url?: string;
  user?: User;
  created_at?: string;
}

export type Answer = Comment;

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackAttachment {
  color: string;
  blocks: SlackBlock[];
}

export interface SlackPayload {
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

export interface MentionMappingConfig {
  filePath?: string;
  json?: string;
}

export type MentionMappingSource = string | MentionMappingConfig;

// Slack section block text limit: https://api.slack.com/reference/block-kit/blocks#section
const SLACK_SECTION_TEXT_LIMIT = 3000;

export function summarize(text: string | undefined, limit = SLACK_SECTION_TEXT_LIMIT): string {
  if (!text) return '';
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return normalized.length > limit ? `${normalized.slice(0, limit).trim()}...` : normalized;
}

function extractSlackMentions(text: string): string[] {
  const mentions = text.match(/<@\w+>/g) ?? [];
  return [...new Set(mentions)];
}

export function extractGitHubMentions(text: string): string[] {
  // Negative lookbehind prevents matching email addresses (e.g. user@example.com)
  const mentions = text.match(/(?<!\w)@[\w-]+/g) ?? [];
  return [...new Set(mentions.map((mention) => mention.slice(1)))];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeMrkdwnText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadMentionMapping(
  mappingSource: MentionMappingSource
): Promise<Record<string, string>> {
  const config =
    typeof mappingSource === 'string'
      ? { filePath: mappingSource, json: undefined }
      : mappingSource;
  const inlineMappingJson = config.json?.trim();

  if (inlineMappingJson) {
    return JSON.parse(inlineMappingJson) as Record<string, string>;
  }

  if (!config.filePath) {
    return {};
  }

  const mappingContent = await fs.promises.readFile(config.filePath, 'utf8');
  return JSON.parse(mappingContent) as Record<string, string>;
}

export async function resolveMentionsToSlack(
  text: string,
  mappingSource: MentionMappingSource
): Promise<string> {
  const githubMentions = extractGitHubMentions(text);
  if (githubMentions.length === 0) {
    return text;
  }

  try {
    const mapping = await loadMentionMapping(mappingSource);

    let resolvedText = text;
    for (const githubUsername of githubMentions) {
      const slackUserId = mapping[githubUsername];
      if (slackUserId) {
        resolvedText = resolvedText.replace(
          new RegExp(`@${escapeRegExp(githubUsername)}\\b`, 'g'),
          `<@${slackUserId}>`
        );
      }
    }

    return resolvedText;
  } catch (error) {
    console.warn('Failed to resolve mentions to Slack:', error);
    return text;
  }
}

function mrkdwnSection(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

function titleLink(url: string | undefined, title: string): string {
  return url ? `*<${url}|${title}>*` : `*${title}*`;
}

function githubUserLink(login: string): string {
  return `<https://github.com/${login}|${login}>`;
}

function buildPayload(
  summaryText: string,
  headerText: string,
  body: string,
  linkUrl: string | undefined,
  linkLabel: string,
  color: string
): SlackPayload {
  const topBlocks: SlackBlock[] = [mrkdwnSection(headerText)];

  if (body) {
    const attachmentBlocks: SlackBlock[] = [mrkdwnSection(body)];
    if (linkUrl) {
      attachmentBlocks.push(mrkdwnSection(`<${linkUrl}|${linkLabel}>`));
    }
    return {
      text: summaryText,
      blocks: topBlocks,
      attachments: [{ color, blocks: attachmentBlocks }],
    };
  }

  if (linkUrl) {
    topBlocks.push(mrkdwnSection(`<${linkUrl}|${linkLabel}>`));
  }
  return { text: summaryText, blocks: topBlocks };
}

async function resolveAndSummarizeBody(
  bodyText: string | undefined,
  mappingSource: MentionMappingSource
): Promise<string> {
  const escaped = escapeMrkdwnText(bodyText ?? '');
  const resolved = await resolveMentionsToSlack(escaped, mappingSource);
  const normalized = resolved.replace(/\r\n/g, '\n').trim();

  // Truncate without splitting a Slack mention token (<@USERID>) mid-way
  const truncate = (text: string, maxLen: number): string =>
    text
      .slice(0, maxLen)
      .replace(/<@[^>]*$/, '')
      .trim();

  // Collect all unique mentions and place them at the top so they are always
  // visible even when the body is truncated. Inline mentions remain in the body.
  const allMentions = extractSlackMentions(normalized);
  const rawPrefix = allMentions.length > 0 ? `${allMentions.join(' ')}\n` : '';

  // Guard: if mentions alone exceed the limit, truncate the prefix itself
  const prefix =
    rawPrefix.length <= SLACK_SECTION_TEXT_LIMIT
      ? rawPrefix
      : rawPrefix
          .slice(0, SLACK_SECTION_TEXT_LIMIT)
          .replace(/<@[^>]*$/, '')
          .trim() + '\n';

  const bodyBudget = SLACK_SECTION_TEXT_LIMIT - prefix.length;

  if (bodyBudget <= 0) {
    return prefix.trim().slice(0, SLACK_SECTION_TEXT_LIMIT);
  }

  if (normalized.length <= bodyBudget) {
    return prefix + normalized;
  }

  return `${prefix}${truncate(normalized, bodyBudget - 3)}...`;
}

export async function buildDiscussionMessage(
  discussion: Discussion,
  mappingSource: MentionMappingSource
): Promise<SlackPayload> {
  const title = escapeMrkdwnText(discussion.title ?? 'No title');
  const url = discussion.html_url ?? discussion.url;
  const createdBy = discussion.user?.login ?? 'unknown';
  const category = discussion.category?.name
    ? ` (${escapeMrkdwnText(discussion.category.name)})`
    : '';
  const body = await resolveAndSummarizeBody(
    discussion.body ?? discussion.body_text,
    mappingSource
  );

  const header = `:speech_balloon: *New discussion created*${category}  by ${githubUserLink(createdBy)}\n${titleLink(url, title)}`;
  return buildPayload(
    `New discussion: ${title}`,
    header,
    body,
    url,
    'View discussion on GitHub',
    '#28A745'
  );
}

export async function buildCommentMessage(
  comment: Comment,
  discussion: Discussion,
  mappingSource: MentionMappingSource
): Promise<SlackPayload> {
  const discussionTitle = escapeMrkdwnText(discussion.title ?? 'No title');
  const commentUrl = comment.html_url ?? comment.url;
  const discussionUrl = discussion.html_url ?? discussion.url;
  const createdBy = comment.user?.login ?? 'unknown';
  const body = await resolveAndSummarizeBody(comment.body ?? comment.body_text, mappingSource);

  const header = `:speech_balloon: *New discussion comment*  by ${githubUserLink(createdBy)}\n${titleLink(discussionUrl, discussionTitle)}`;
  return buildPayload(
    `New comment on: ${discussionTitle}`,
    header,
    body,
    commentUrl,
    'View comment on GitHub',
    '#0075DB'
  );
}

export async function buildAnsweredMessage(
  answer: Answer,
  discussion: Discussion,
  mappingSource: MentionMappingSource
): Promise<SlackPayload> {
  const discussionTitle = escapeMrkdwnText(discussion.title ?? 'No title');
  const answerUrl = answer.html_url ?? answer.url;
  const discussionUrl = discussion.html_url ?? discussion.url;
  const answeredBy = answer.user?.login ?? 'unknown';
  const category = discussion.category?.name
    ? ` (${escapeMrkdwnText(discussion.category.name)})`
    : '';
  const body = await resolveAndSummarizeBody(answer.body ?? answer.body_text, mappingSource);

  const header = `:white_check_mark: *Discussion answered*${category}  answered by ${githubUserLink(answeredBy)}\n${titleLink(discussionUrl, discussionTitle)}`;
  return buildPayload(
    `Discussion answered: ${discussionTitle}`,
    header,
    body,
    answerUrl,
    'View answer on GitHub',
    '#F6B73C'
  );
}

export function sendSlackMessage(webhookUrl: string, payload: SlackPayload): Promise<string> {
  const body = JSON.stringify(payload);
  const url = new URL(webhookUrl);

  const options: https.RequestOptions = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    timeout: 10000,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const response = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(response);
        } else {
          reject(new Error(`Slack webhook request failed: ${res.statusCode} ${response}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Slack webhook request timed out'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
