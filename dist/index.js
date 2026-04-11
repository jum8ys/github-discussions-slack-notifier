"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const notifier_js_1 = require("./notifier.js");
const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME;
const webhookUrl = process.env.INPUT_SLACK_WEBHOOK_URL ?? process.env.SLACK_WEBHOOK_URL;
const mappingFilePath = process.env.INPUT_GITHUB_USERNAME_SLACK_MAPPING ??
    process.env.GITHUB_USERNAME_SLACK_MAPPING ??
    '.github/github-username-slack-mapping.json';
const notifyDiscussionCreated = (process.env.INPUT_NOTIFY_DISCUSSION_CREATED ??
    process.env.NOTIFY_DISCUSSION_CREATED ??
    'true') === 'true';
const notifyCommentCreated = (process.env.INPUT_NOTIFY_COMMENT_CREATED ?? process.env.NOTIFY_COMMENT_CREATED ?? 'true') ===
    'true';
if (!webhookUrl) {
    console.error('Missing SLACK_WEBHOOK_URL. Please configure this secret in GitHub or pass slack_webhook_url as an input.');
    process.exit(1);
}
const webhookUrlString = webhookUrl;
if (!eventPath || !fs_1.default.existsSync(eventPath)) {
    console.log('No GitHub event payload available. Skipping Slack notification.');
    process.exit(0);
}
const payload = JSON.parse(fs_1.default.readFileSync(eventPath, 'utf8'));
async function main() {
    let slackPayload;
    if (eventName === 'discussion' && payload.action === 'created') {
        if (!notifyDiscussionCreated) {
            console.log('Discussion creation notifications are disabled.');
            return;
        }
        slackPayload = await (0, notifier_js_1.buildDiscussionMessage)(payload.discussion ?? {}, mappingFilePath);
    }
    else if (eventName === 'discussion_comment' && payload.action === 'created') {
        if (!notifyCommentCreated) {
            console.log('Discussion comment notifications are disabled.');
            return;
        }
        const commentPayload = payload;
        slackPayload = await (0, notifier_js_1.buildCommentMessage)(commentPayload.comment ?? {}, commentPayload.discussion ?? {}, mappingFilePath);
    }
    else {
        console.log(`Event ${eventName}/${payload.action} is ignored.`);
        return;
    }
    console.log('Sending Slack notification...');
    await (0, notifier_js_1.sendSlackMessage)(webhookUrlString, slackPayload);
    console.log('Slack notification sent.');
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
