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

export async function resolveMentionsToSlack(
  text: string,
  mappingFilePath: string
): Promise<string> {
  const githubMentions = extractGitHubMentions(text);
  if (githubMentions.length === 0) {
    return text;
  }

  try {
    const mappingContent = await fs.promises.readFile(mappingFilePath, 'utf8');
    const mapping = JSON.parse(mappingContent) as Record<string, string>;

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

export async function buildDiscussionMessage(
  discussion: Discussion,
  mappingFilePath: string
): Promise<string> {
  const title = discussion.title ?? 'No title';
  const resolvedBodyText = await resolveMentionsToSlack(
    discussion.body ?? discussion.body_text ?? '',
    mappingFilePath
  );
  const body = summarize(resolvedBodyText);
  const url = discussion.html_url ?? discussion.url;
  const createdBy = discussion.user?.login ?? 'unknown';
  const category = discussion.category?.name ? ` (${discussion.category.name})` : '';
  const createdAt = discussion.created_at ?? discussion.published_at ?? '';

  const text: string[] = [];
  text.push(`*New discussion created*${category}`);
  text.push(`*${title}*`);
  text.push(`• by *${createdBy}*`);
  if (createdAt) text.push(`• created at ${createdAt}`);
  if (body) text.push(`\n${body}`);
  if (url) text.push(`\n<${url}|View discussion on GitHub>`);
  return text.join('\n');
}

export async function buildCommentMessage(
  comment: Comment,
  discussion: Discussion,
  mappingFilePath: string
): Promise<string> {
  const discussionTitle = discussion.title ?? 'No title';
  const resolvedBodyText = await resolveMentionsToSlack(
    comment.body ?? comment.body_text ?? '',
    mappingFilePath
  );
  const body = summarize(resolvedBodyText);
  const url = comment.html_url ?? comment.url;
  const createdBy = comment.user?.login ?? 'unknown';
  const createdAt = comment.created_at ?? '';

  const text: string[] = [];
  text.push('*New discussion comment*');
  text.push(`*${discussionTitle}*`);
  text.push(`• by *${createdBy}*`);
  if (createdAt) text.push(`• created at ${createdAt}`);
  if (body) text.push(`\n${body}`);
  if (url) text.push(`\n<${url}|View comment on GitHub>`);
  return text.join('\n');
}

export function sendSlackMessage(webhookUrl: string, message: string): Promise<string> {
  const body = JSON.stringify({ text: message });
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
