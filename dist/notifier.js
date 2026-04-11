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
async function resolveMentionsToSlack(text, mappingSource) {
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
function mrkdwnSection(text) {
    return { type: 'section', text: { type: 'mrkdwn', text } };
}
function titleLink(url, title) {
    return url ? `*<${url}|${title}>*` : `*${title}*`;
}
function githubUserLink(login) {
    return `<https://github.com/${login}|${login}>`;
}
function buildPayload(summaryText, headerText, body, linkUrl, linkLabel, color) {
    const topBlocks = [mrkdwnSection(headerText)];
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
    const title = discussion.title ?? 'No title';
    const url = discussion.html_url ?? discussion.url;
    const createdBy = discussion.user?.login ?? 'unknown';
    const category = discussion.category?.name ? ` (${discussion.category.name})` : '';
    const body = summarize(await resolveMentionsToSlack(discussion.body ?? discussion.body_text ?? '', mappingSource));
    const header = `:speech_balloon: *New discussion created*${category}  by ${githubUserLink(createdBy)}\n${titleLink(url, title)}`;
    return buildPayload(`New discussion: ${title}`, header, body, url, 'View discussion on GitHub', '#28A745');
}
async function buildCommentMessage(comment, discussion, mappingSource) {
    const discussionTitle = discussion.title ?? 'No title';
    const commentUrl = comment.html_url ?? comment.url;
    const discussionUrl = discussion.html_url ?? discussion.url;
    const createdBy = comment.user?.login ?? 'unknown';
    const body = summarize(await resolveMentionsToSlack(comment.body ?? comment.body_text ?? '', mappingSource));
    const header = `:speech_balloon: *New discussion comment*  by ${githubUserLink(createdBy)}\n${titleLink(discussionUrl, discussionTitle)}`;
    return buildPayload(`New comment on: ${discussionTitle}`, header, body, commentUrl, 'View comment on GitHub', '#0075DB');
}
async function buildAnsweredMessage(answer, discussion, mappingSource) {
    const discussionTitle = discussion.title ?? 'No title';
    const answerUrl = answer.html_url ?? answer.url;
    const discussionUrl = discussion.html_url ?? discussion.url;
    const answeredBy = answer.user?.login ?? 'unknown';
    const category = discussion.category?.name ? ` (${discussion.category.name})` : '';
    const body = summarize(await resolveMentionsToSlack(answer.body ?? answer.body_text ?? '', mappingSource));
    const header = `:white_check_mark: *Discussion answered*${category}  answered by ${githubUserLink(answeredBy)}\n${titleLink(discussionUrl, discussionTitle)}`;
    return buildPayload(`Discussion answered: ${discussionTitle}`, header, body, answerUrl, 'View answer on GitHub', '#F6B73C');
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
