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

export function summarize(text: string | undefined, limit = 200): string {
  if (!text) return '';
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  return normalized.length > limit ? `${normalized.slice(0, limit).trim()}...` : normalized;
}

export function extractGitHubMentions(text: string): string[] {
  const mentions = text.match(/@[\w-]+/g) ?? [];
  return [...new Set(mentions.map((mention) => mention.slice(1)))];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export async function buildDiscussionMessage(
  discussion: Discussion,
  mappingSource: MentionMappingSource
): Promise<SlackPayload> {
  const title = discussion.title ?? 'No title';
  const url = discussion.html_url ?? discussion.url;
  const createdBy = discussion.user?.login ?? 'unknown';
  const category = discussion.category?.name ? ` (${discussion.category.name})` : '';
  const body = summarize(
    await resolveMentionsToSlack(discussion.body ?? discussion.body_text ?? '', mappingSource)
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
  const discussionTitle = discussion.title ?? 'No title';
  const commentUrl = comment.html_url ?? comment.url;
  const discussionUrl = discussion.html_url ?? discussion.url;
  const createdBy = comment.user?.login ?? 'unknown';
  const body = summarize(
    await resolveMentionsToSlack(comment.body ?? comment.body_text ?? '', mappingSource)
  );

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
  const discussionTitle = discussion.title ?? 'No title';
  const answerUrl = answer.html_url ?? answer.url;
  const discussionUrl = discussion.html_url ?? discussion.url;
  const answeredBy = answer.user?.login ?? 'unknown';
  const category = discussion.category?.name ? ` (${discussion.category.name})` : '';
  const body = summarize(
    await resolveMentionsToSlack(answer.body ?? answer.body_text ?? '', mappingSource)
  );

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

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
