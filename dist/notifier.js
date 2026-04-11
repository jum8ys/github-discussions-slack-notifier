"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarize = summarize;
exports.extractGitHubMentions = extractGitHubMentions;
exports.resolveMentionsToSlack = resolveMentionsToSlack;
exports.buildDiscussionMessage = buildDiscussionMessage;
exports.buildCommentMessage = buildCommentMessage;
exports.buildAnsweredMessage = buildAnsweredMessage;
exports.sendSlackMessage = sendSlackMessage;
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const url_1 = require("url");
function summarize(text, limit = 200) {
    if (!text)
        return '';
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized)
        return '';
    return normalized.length > limit ? `${normalized.slice(0, limit).trim()}...` : normalized;
}
function extractGitHubMentions(text) {
    const mentions = text.match(/@[\w-]+/g) ?? [];
    return [...new Set(mentions.map((mention) => mention.slice(1)))];
}
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
async function resolveMentionsToSlack(text, mappingFilePath) {
    const githubMentions = extractGitHubMentions(text);
    if (githubMentions.length === 0) {
        return text;
    }
    try {
        const mappingContent = await fs_1.default.promises.readFile(mappingFilePath, 'utf8');
        const mapping = JSON.parse(mappingContent);
        let resolvedText = text;
        for (const githubUsername of githubMentions) {
            const slackUserId = mapping[githubUsername];
            if (slackUserId) {
                resolvedText = resolvedText.replace(new RegExp(`@${escapeRegExp(githubUsername)}\\b`, 'g'), `<@${slackUserId}>`);
            }
        }
        return resolvedText;
    }
    catch (error) {
        console.warn('Failed to resolve mentions to Slack:', error);
        return text;
    }
}
async function buildDiscussionMessage(discussion, mappingFilePath) {
    const title = discussion.title ?? 'No title';
    const resolvedBodyText = await resolveMentionsToSlack(discussion.body ?? discussion.body_text ?? '', mappingFilePath);
    const body = summarize(resolvedBodyText);
    const url = discussion.html_url ?? discussion.url;
    const createdBy = discussion.user?.login ?? 'unknown';
    const category = discussion.category?.name ? ` (${discussion.category.name})` : '';
    const titleText = url ? `*<${url}|${title}>*` : `*${title}*`;
    const authorText = `by <https://github.com/${createdBy}|${createdBy}>`;
    const topBlocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `:speech_balloon: *New discussion created*${category}\n${titleText}`,
            },
        },
        {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: authorText }],
        },
    ];
    if (body) {
        const attachmentBlocks = [
            { type: 'section', text: { type: 'mrkdwn', text: body } },
        ];
        if (url) {
            attachmentBlocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: `<${url}|View discussion on GitHub>` },
            });
        }
        return {
            text: `New discussion: ${title}`,
            blocks: topBlocks,
            attachments: [{ color: '#28A745', blocks: attachmentBlocks }],
        };
    }
    if (url) {
        topBlocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `<${url}|View discussion on GitHub>` },
        });
    }
    return { text: `New discussion: ${title}`, blocks: topBlocks };
}
async function buildCommentMessage(comment, discussion, mappingFilePath) {
    const discussionTitle = discussion.title ?? 'No title';
    const resolvedBodyText = await resolveMentionsToSlack(comment.body ?? comment.body_text ?? '', mappingFilePath);
    const body = summarize(resolvedBodyText);
    const commentUrl = comment.html_url ?? comment.url;
    const discussionUrl = discussion.html_url ?? discussion.url;
    const createdBy = comment.user?.login ?? 'unknown';
    const titleText = discussionUrl
        ? `*<${discussionUrl}|${discussionTitle}>*`
        : `*${discussionTitle}*`;
    const authorText = `by <https://github.com/${createdBy}|${createdBy}>`;
    const topBlocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `:speech_balloon: *New discussion comment*\n${titleText}`,
            },
        },
        {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: authorText }],
        },
    ];
    if (body) {
        const attachmentBlocks = [
            { type: 'section', text: { type: 'mrkdwn', text: body } },
        ];
        if (commentUrl) {
            attachmentBlocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: `<${commentUrl}|View comment on GitHub>` },
            });
        }
        return {
            text: `New comment on: ${discussionTitle}`,
            blocks: topBlocks,
            attachments: [{ color: '#0075DB', blocks: attachmentBlocks }],
        };
    }
    if (commentUrl) {
        topBlocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `<${commentUrl}|View comment on GitHub>` },
        });
    }
    return { text: `New comment on: ${discussionTitle}`, blocks: topBlocks };
}
async function buildAnsweredMessage(answer, discussion, mappingFilePath) {
    const discussionTitle = discussion.title ?? 'No title';
    const resolvedBodyText = await resolveMentionsToSlack(answer.body ?? answer.body_text ?? '', mappingFilePath);
    const body = summarize(resolvedBodyText);
    const answerUrl = answer.html_url ?? answer.url;
    const discussionUrl = discussion.html_url ?? discussion.url;
    const answeredBy = answer.user?.login ?? 'unknown';
    const category = discussion.category?.name ? ` (${discussion.category.name})` : '';
    const titleText = discussionUrl
        ? `*<${discussionUrl}|${discussionTitle}>*`
        : `*${discussionTitle}*`;
    const authorText = `answered by <https://github.com/${answeredBy}|${answeredBy}>`;
    const topBlocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `:white_check_mark: *Discussion answered*${category}\n${titleText}`,
            },
        },
        {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: authorText }],
        },
    ];
    if (body) {
        const attachmentBlocks = [
            { type: 'section', text: { type: 'mrkdwn', text: body } },
        ];
        if (answerUrl) {
            attachmentBlocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: `<${answerUrl}|View answer on GitHub>` },
            });
        }
        return {
            text: `Discussion answered: ${discussionTitle}`,
            blocks: topBlocks,
            attachments: [{ color: '#F6B73C', blocks: attachmentBlocks }],
        };
    }
    if (answerUrl) {
        topBlocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `<${answerUrl}|View answer on GitHub>` },
        });
    }
    return { text: `Discussion answered: ${discussionTitle}`, blocks: topBlocks };
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
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
