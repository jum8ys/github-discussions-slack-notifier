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
    const createdAt = discussion.created_at ?? discussion.published_at ?? '';
    const text = [];
    text.push(`*New discussion created*${category}`);
    text.push(`*${title}*`);
    text.push(`• by *${createdBy}*`);
    if (createdAt)
        text.push(`• created at ${createdAt}`);
    if (body)
        text.push(`\n${body}`);
    if (url)
        text.push(`\n<${url}|View discussion on GitHub>`);
    return text.join('\n');
}
async function buildCommentMessage(comment, discussion, mappingFilePath) {
    const discussionTitle = discussion.title ?? 'No title';
    const resolvedBodyText = await resolveMentionsToSlack(comment.body ?? comment.body_text ?? '', mappingFilePath);
    const body = summarize(resolvedBodyText);
    const url = comment.html_url ?? comment.url;
    const createdBy = comment.user?.login ?? 'unknown';
    const createdAt = comment.created_at ?? '';
    const text = [];
    text.push('*New discussion comment*');
    text.push(`*${discussionTitle}*`);
    text.push(`• by *${createdBy}*`);
    if (createdAt)
        text.push(`• created at ${createdAt}`);
    if (body)
        text.push(`\n${body}`);
    if (url)
        text.push(`\n<${url}|View comment on GitHub>`);
    return text.join('\n');
}
function sendSlackMessage(webhookUrl, message) {
    const body = JSON.stringify({ text: message });
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
