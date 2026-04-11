import fs from 'fs';
import {
  buildCommentMessage,
  buildDiscussionMessage,
  Discussion,
  Comment,
  SlackPayload,
  sendSlackMessage,
} from './notifier.js';

interface DiscussionEventPayload {
  action?: string;
  discussion?: Discussion;
}

interface DiscussionCommentEventPayload {
  action?: string;
  comment?: Comment;
  discussion?: Discussion;
}

const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME;
const webhookUrl = process.env.INPUT_SLACK_WEBHOOK_URL ?? process.env.SLACK_WEBHOOK_URL;
const mappingFilePath =
  process.env.INPUT_GITHUB_USERNAME_SLACK_MAPPING ??
  process.env.GITHUB_USERNAME_SLACK_MAPPING ??
  '.github/github-username-slack-mapping.json';
const notifyDiscussionCreated =
  (process.env.INPUT_NOTIFY_DISCUSSION_CREATED ??
    process.env.NOTIFY_DISCUSSION_CREATED ??
    'true') === 'true';
const notifyCommentCreated =
  (process.env.INPUT_NOTIFY_COMMENT_CREATED ?? process.env.NOTIFY_COMMENT_CREATED ?? 'true') ===
  'true';

if (!webhookUrl) {
  console.error(
    'Missing SLACK_WEBHOOK_URL. Please configure this secret in GitHub or pass slack_webhook_url as an input.'
  );
  process.exit(1);
}

const webhookUrlString = webhookUrl;

if (!eventPath || !fs.existsSync(eventPath)) {
  console.log('No GitHub event payload available. Skipping Slack notification.');
  process.exit(0);
}

const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as
  | DiscussionEventPayload
  | DiscussionCommentEventPayload;

async function main(): Promise<void> {
  let slackPayload: SlackPayload;

  if (eventName === 'discussion' && payload.action === 'created') {
    if (!notifyDiscussionCreated) {
      console.log('Discussion creation notifications are disabled.');
      return;
    }
    slackPayload = await buildDiscussionMessage(
      (payload as DiscussionEventPayload).discussion ?? {},
      mappingFilePath
    );
  } else if (eventName === 'discussion_comment' && payload.action === 'created') {
    if (!notifyCommentCreated) {
      console.log('Discussion comment notifications are disabled.');
      return;
    }
    const commentPayload = payload as DiscussionCommentEventPayload;
    slackPayload = await buildCommentMessage(
      commentPayload.comment ?? {},
      commentPayload.discussion ?? {},
      mappingFilePath
    );
  } else {
    console.log(`Event ${eventName}/${payload.action} is ignored.`);
    return;
  }

  console.log('Sending Slack notification...');
  await sendSlackMessage(webhookUrlString, slackPayload);
  console.log('Slack notification sent.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
