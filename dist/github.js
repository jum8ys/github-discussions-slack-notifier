"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSlackTs = extractSlackTs;
exports.appendSlackTsToDiscussion = appendSlackTsToDiscussion;
const https_1 = __importDefault(require("https"));
const url_1 = require("url");
const GITHUB_GRAPHQL_URL = process.env.GITHUB_GRAPHQL_URL ?? 'https://api.github.com/graphql';
const SLACK_TS_RE = /<!--\s*slack-notifier:ts=([0-9]+\.[0-9]+)\s*-->/;
function extractSlackTs(body) {
    return SLACK_TS_RE.exec(body)?.[1];
}
function requestGitHubGraphQL(token, requestBody) {
    const { hostname, pathname } = new url_1.URL(GITHUB_GRAPHQL_URL);
    const options = {
        hostname,
        path: pathname,
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
            'User-Agent': 'github-discussions-slack-notifier',
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
                    reject(new Error(`GitHub GraphQL request failed: ${res.statusCode} ${response}`));
                }
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error('GitHub GraphQL request timed out'));
        });
        req.on('error', reject);
        req.write(requestBody);
        req.end();
    });
}
function parseGraphQLResponse(response) {
    try {
        return JSON.parse(response);
    }
    catch (error) {
        throw new Error(`Failed to parse GitHub GraphQL response: ${String(error)}`);
    }
}
async function appendSlackTsToDiscussion(token, nodeId, ts) {
    const getBodyQuery = `
    query DiscussionBody($discussionId: ID!) {
      node(id: $discussionId) {
        ... on Discussion {
          body
        }
      }
    }
  `;
    const getBodyRequest = JSON.stringify({
        query: getBodyQuery,
        variables: { discussionId: nodeId },
    });
    const getBodyResponseRaw = await requestGitHubGraphQL(token, getBodyRequest);
    const getBodyResponse = parseGraphQLResponse(getBodyResponseRaw);
    if (getBodyResponse.errors?.length) {
        throw new Error(`GitHub GraphQL error: ${getBodyResponse.errors[0].message}`);
    }
    const currentBody = getBodyResponse.data?.node?.body;
    if (typeof currentBody !== 'string') {
        throw new Error('GitHub GraphQL response missing discussion body');
    }
    if (extractSlackTs(currentBody)) {
        return;
    }
    const marker = `<!-- slack-notifier:ts=${ts} -->`;
    const newBody = currentBody ? `${currentBody}\n\n${marker}` : marker;
    const updateQuery = `
    mutation UpdateDiscussion($discussionId: ID!, $body: String!) {
      updateDiscussion(input: {discussionId: $discussionId, body: $body}) {
        discussion { id }
      }
    }
  `;
    const updateRequest = JSON.stringify({
        query: updateQuery,
        variables: { discussionId: nodeId, body: newBody },
    });
    const updateResponseRaw = await requestGitHubGraphQL(token, updateRequest);
    const updateResponse = parseGraphQLResponse(updateResponseRaw);
    if (updateResponse.errors?.length) {
        throw new Error(`GitHub GraphQL error: ${updateResponse.errors[0].message}`);
    }
}
