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
const mappingFilePath = process.env.INPUT_SLACK_USER_MAPPING_FILE ??
    process.env.SLACK_USER_MAPPING_FILE ??
    '.github/slack_user_mapping.json';
const mappingJson = process.env.INPUT_SLACK_USER_MAPPING_JSON ?? process.env.SLACK_USER_MAPPING_JSON;
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
const mentionMapping = { filePath: mappingFilePath, json: mappingJson };
async function main() {
    let slackPayload;
    if (eventName === 'discussion' && payload.action === 'created') {
        slackPayload = await (0, notifier_js_1.buildDiscussionMessage)(payload.discussion ?? {}, mentionMapping);
    }
    else if (eventName === 'discussion' && payload.action === 'answered') {
        const answeredPayload = payload;
        slackPayload = await (0, notifier_js_1.buildAnsweredMessage)(answeredPayload.answer ?? {}, answeredPayload.discussion ?? {}, mentionMapping);
    }
    else if (eventName === 'discussion_comment' && payload.action === 'created') {
        const commentPayload = payload;
        slackPayload = await (0, notifier_js_1.buildCommentMessage)(commentPayload.comment ?? {}, commentPayload.discussion ?? {}, mentionMapping);
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
