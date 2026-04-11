import fs from 'fs';
import {
  buildAnsweredMessage,
  buildCommentMessage,
  buildDiscussionMessage,
  Discussion,
  Comment,
  Answer,
  MentionMappingConfig,
  SlackPayload,
  sendSlackMessage,
} from './notifier.js';

interface DiscussionEventPayload {
  action?: string;
  discussion?: Discussion;
  answer?: Answer;
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
  process.env.INPUT_SLACK_USER_MAPPING_FILE ??
  process.env.SLACK_USER_MAPPING_FILE ??
  '.github/github-username-slack-mapping.json';
const mappingJson =
  process.env.INPUT_SLACK_USER_MAPPING_JSON ?? process.env.SLACK_USER_MAPPING_JSON;

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
const mentionMapping: MentionMappingConfig = { filePath: mappingFilePath, json: mappingJson };

async function main(): Promise<void> {
  let slackPayload: SlackPayload;

  if (eventName === 'discussion' && payload.action === 'created') {
    slackPayload = await buildDiscussionMessage(
      (payload as DiscussionEventPayload).discussion ?? {},
      mentionMapping
    );
  } else if (eventName === 'discussion' && payload.action === 'answered') {
    const answeredPayload = payload as DiscussionEventPayload;
    slackPayload = await buildAnsweredMessage(
      answeredPayload.answer ?? {},
      answeredPayload.discussion ?? {},
      mentionMapping
    );
  } else if (eventName === 'discussion_comment' && payload.action === 'created') {
    const commentPayload = payload as DiscussionCommentEventPayload;
    slackPayload = await buildCommentMessage(
      commentPayload.comment ?? {},
      commentPayload.discussion ?? {},
      mentionMapping
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
