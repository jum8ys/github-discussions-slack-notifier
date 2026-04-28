"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarize = summarize;
exports.extractGitHubMentions = extractGitHubMentions;
exports.buildDiscussionMessage = buildDiscussionMessage;
exports.buildCommentMessage = buildCommentMessage;
exports.buildAnsweredMessage = buildAnsweredMessage;
exports.sendSlackMessage = sendSlackMessage;
exports.postSlackApiMessage = postSlackApiMessage;
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const url_1 = require("url");
const GITHUB_SERVER_URL = (process.env.GITHUB_SERVER_URL ?? 'https://github.com').replace(/\/$/, '');
// Slack section block text limit: https://api.slack.com/reference/block-kit/blocks#section
const SLACK_SECTION_TEXT_LIMIT = 3000;
function summarize(text, limit = SLACK_SECTION_TEXT_LIMIT) {
    if (!text)
        return '';
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized)
        return '';
    return normalized.length > limit ? `${normalized.slice(0, limit - 3).trim()}...` : normalized;
}
function extractGitHubMentions(text) {
    // Negative lookbehind prevents matching email addresses (e.g. user@example.com)
    const mentions = text.match(/(?<!\w)@[\w-]+/g) ?? [];
    return [...new Set(mentions.map((mention) => mention.slice(1)))];
}
function escapeMrkdwnText(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
async function loadMentionMapping(mappingSource) {
    const config = typeof mappingSource === 'string'
        ? { filePath: mappingSource, json: undefined }
        : mappingSource;
    const inlineMappingJson = config.json?.trim();
    if (inlineMappingJson) {
        return JSON.parse(inlineMappingJson);
    }
    if (!config.filePath) {
        return {};
    }
    const mappingContent = await fs_1.default.promises.readFile(config.filePath, 'utf8');
    return JSON.parse(mappingContent);
}
function mrkdwnSection(text) {
    return { type: 'section', text: { type: 'mrkdwn', text } };
}
function titleLink(url, title) {
    return url ? `*<${url}|${title}>*` : `*${title}*`;
}
function githubUserLink(login) {
    return `<${GITHUB_SERVER_URL}/${login}|${login}>`;
}
function buildBodyText(bodyText) {
    const escaped = escapeMrkdwnText(bodyText ?? '');
    const linked = escaped.replace(/(?<!\w)@([\w-]+)/g, (_, u) => `<${GITHUB_SERVER_URL}/${u}|@${u}>`);
    // If summarize cuts inside a mrkdwn link, strip the incomplete token.
    // All literal '<' were escaped to '&lt;' above, so any '<' here opens a link.
    return summarize(linked).replace(/\s*<[^>]*\.\.\.$/, '...');
}
async function buildMentionsText(bodyText, mappingSource) {
    const githubMentions = extractGitHubMentions(bodyText ?? '');
    if (githubMentions.length === 0)
        return '';
    try {
        const mapping = await loadMentionMapping(mappingSource);
        return githubMentions
            .map((username) => {
            const slackId = mapping[username];
            return slackId ? `<@${slackId}>` : githubUserLink(username);
        })
            .join(' ');
    }
    catch (error) {
        console.warn('Failed to resolve mentions to Slack:', error);
        return githubMentions.map((u) => githubUserLink(u)).join(' ');
    }
}
function buildPayload(summaryText, headerText, mentionsText, body, linkUrl, linkLabel, color) {
    const topBlocks = [mrkdwnSection(headerText)];
    if (mentionsText) {
        topBlocks.push(mrkdwnSection(mentionsText));
    }
    if (body) {
        const attachmentBlocks = [mrkdwnSection(body)];
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
async function buildDiscussionMessage(discussion, mappingSource) {
    const title = escapeMrkdwnText(discussion.title ?? 'No title');
    const url = discussion.html_url ?? discussion.url;
    const createdBy = discussion.user?.login ?? 'unknown';
    const category = discussion.category?.name
        ? ` (${escapeMrkdwnText(discussion.category.name)})`
        : '';
    const rawBody = discussion.body ?? discussion.body_text;
    const body = buildBodyText(rawBody);
    const mentionsText = await buildMentionsText(rawBody, mappingSource);
    const header = `:speech_balloon: *New discussion created*${category}  by ${githubUserLink(createdBy)}\n${titleLink(url, title)}`;
    return buildPayload(`New discussion: ${title}`, header, mentionsText, body, url, 'View discussion on GitHub', '#28A745');
}
async function buildCommentMessage(comment, discussion, mappingSource) {
    const discussionTitle = escapeMrkdwnText(discussion.title ?? 'No title');
    const commentUrl = comment.html_url ?? comment.url;
    const discussionUrl = discussion.html_url ?? discussion.url;
    const createdBy = comment.user?.login ?? 'unknown';
    const rawBody = comment.body ?? comment.body_text;
    const body = buildBodyText(rawBody);
    const mentionsText = await buildMentionsText(rawBody, mappingSource);
    const header = `:speech_balloon: *New discussion comment*  by ${githubUserLink(createdBy)}\n${titleLink(discussionUrl, discussionTitle)}`;
    return buildPayload(`New comment on: ${discussionTitle}`, header, mentionsText, body, commentUrl, 'View comment on GitHub', '#0075DB');
}
async function buildAnsweredMessage(answer, discussion, mappingSource) {
    const discussionTitle = escapeMrkdwnText(discussion.title ?? 'No title');
    const answerUrl = answer.html_url ?? answer.url;
    const discussionUrl = discussion.html_url ?? discussion.url;
    const answeredBy = answer.user?.login ?? 'unknown';
    const category = discussion.category?.name
        ? ` (${escapeMrkdwnText(discussion.category.name)})`
        : '';
    const rawBody = answer.body ?? answer.body_text;
    const body = buildBodyText(rawBody);
    const mentionsText = await buildMentionsText(rawBody, mappingSource);
    const header = `:white_check_mark: *Discussion answered*${category}  answered by ${githubUserLink(answeredBy)}\n${titleLink(discussionUrl, discussionTitle)}`;
    return buildPayload(`Discussion answered: ${discussionTitle}`, header, mentionsText, body, answerUrl, 'View answer on GitHub', '#F6B73C');
}
function sendSlackMessage(webhookUrl, payload) {
    const body = JSON.stringify(payload);
    const url = new url_1.URL(webhookUrl);
    const options = {
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
        const req = https_1.default.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () => {
                const response = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(response);
                }
                else {
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
function postSlackApiMessage(botToken, channelId, payload) {
    const body = JSON.stringify({ channel: channelId, ...payload });
    const options = {
        hostname: 'slack.com',
        path: '/api/chat.postMessage',
        method: 'POST',
        headers: {
            Authorization: `Bearer ${botToken}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
    };
    return new Promise((resolve, reject) => {
        const req = https_1.default.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () => {
                const response = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    let parsed;
                    try {
                        parsed = JSON.parse(response);
                    }
                    catch (error) {
                        reject(new Error(`Failed to parse Slack API response: ${String(error)}`));
                        return;
                    }
                    if (!parsed.ok) {
                        reject(new Error(`Slack API error: ${parsed.error ?? 'unknown'}`));
                    }
                    else {
                        resolve(parsed.ts ?? '');
                    }
                }
                else {
                    reject(new Error(`Slack API request failed: ${res.statusCode} ${response}`));
                }
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error('Slack API request timed out'));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
