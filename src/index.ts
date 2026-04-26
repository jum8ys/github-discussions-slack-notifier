import fs from 'fs';
import {
  buildAnsweredMessage,
  buildCommentMessage,
  buildDiscussionMessage,
  Discussion,
  Comment,
  Answer,
  MentionMappingConfig,
  sendSlackMessage,
  postSlackApiMessage,
} from './notifier.js';
import { extractSlackTs, appendSlackTsToDiscussion } from './github.js';

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
const webhookUrl = process.env.INPUT_SLACK_WEBHOOK_URL;
const botToken = process.env.INPUT_SLACK_BOT_TOKEN;
const channelId = process.env.INPUT_SLACK_CHANNEL_ID;
const threadModeInput = process.env.INPUT_THREAD_MODE ?? 'channel_and_thread';
const githubToken = process.env.INPUT_GITHUB_TOKEN;
const mappingFilePath =
  process.env.INPUT_SLACK_USER_MAPPING_FILE_PATH ?? '.github/slack_user_mapping.json';
const mappingJson = process.env.INPUT_SLACK_USER_MAPPING_JSON;

if (!webhookUrl && !botToken) {
  console.error(
    'Missing Slack credentials. Provide slack_webhook_url or slack_bot_token as an action input.'
  );
  process.exit(1);
}

if (botToken && !channelId) {
  console.error('slack_channel_id is required when slack_bot_token is provided.');
  process.exit(1);
}

if (botToken && !githubToken) {
  console.error('github_token is required when slack_bot_token is provided.');
  process.exit(1);
}

type ThreadMode = 'channel_and_thread' | 'thread_only';

function isThreadMode(value: string): value is ThreadMode {
  return value === 'channel_and_thread' || value === 'thread_only';
}

if (!isThreadMode(threadModeInput)) {
  console.error(
    `Invalid thread_mode: "${threadModeInput}". Allowed values are "channel_and_thread" and "thread_only".`
  );
  process.exit(1);
}

const threadMode: ThreadMode = threadModeInput;

if (!eventPath || !fs.existsSync(eventPath)) {
  console.log('No GitHub event payload available. Skipping Slack notification.');
  process.exit(0);
}

const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as
  | DiscussionEventPayload
  | DiscussionCommentEventPayload;
const mentionMapping: MentionMappingConfig = { filePath: mappingFilePath, json: mappingJson };

async function persistThreadTsIfPossible(discussion: Discussion, ts: string): Promise<void> {
  if (!discussion.node_id || !ts || !githubToken) {
    return;
  }

  try {
    await appendSlackTsToDiscussion(githubToken, discussion.node_id, ts);
  } catch (error) {
    console.warn('Failed to persist Slack thread ts to discussion body:', error);
  }
}

async function main(): Promise<void> {
  if (eventName === 'discussion' && payload.action === 'created') {
    const discussion = (payload as DiscussionEventPayload).discussion ?? {};
    const slackPayload = await buildDiscussionMessage(discussion, mentionMapping);

    if (botToken && channelId) {
      const ts = await postSlackApiMessage(botToken, channelId, slackPayload);
      await persistThreadTsIfPossible(discussion, ts);
    } else {
      await sendSlackMessage(webhookUrl!, slackPayload);
    }
  } else if (eventName === 'discussion' && payload.action === 'answered') {
    const answeredPayload = payload as DiscussionEventPayload;
    const discussion = answeredPayload.discussion ?? {};
    const slackPayload = await buildAnsweredMessage(
      answeredPayload.answer ?? {},
      discussion,
      mentionMapping
    );

    if (botToken && channelId) {
      const parentTs = extractSlackTs(discussion.body ?? '');
      if (parentTs) {
        await postSlackApiMessage(botToken, channelId, {
          ...slackPayload,
          thread_ts: parentTs,
          reply_broadcast: threadMode === 'channel_and_thread',
        });
      } else {
        const ts = await postSlackApiMessage(botToken, channelId, slackPayload);
        await persistThreadTsIfPossible(discussion, ts);
      }
    } else {
      await sendSlackMessage(webhookUrl!, slackPayload);
    }
  } else if (eventName === 'discussion_comment' && payload.action === 'created') {
    const commentPayload = payload as DiscussionCommentEventPayload;
    const discussion = commentPayload.discussion ?? {};
    const slackPayload = await buildCommentMessage(
      commentPayload.comment ?? {},
      discussion,
      mentionMapping
    );

    if (botToken && channelId) {
      const parentTs = extractSlackTs(discussion.body ?? '');
      if (parentTs) {
        await postSlackApiMessage(botToken, channelId, {
          ...slackPayload,
          thread_ts: parentTs,
          reply_broadcast: threadMode === 'channel_and_thread',
        });
      } else {
        const ts = await postSlackApiMessage(botToken, channelId, slackPayload);
        await persistThreadTsIfPossible(discussion, ts);
      }
    } else {
      await sendSlackMessage(webhookUrl!, slackPayload);
    }
  } else {
    console.log(`Event ${eventName}/${payload.action} is ignored.`);
    return;
  }

  console.log('Slack notification sent.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
