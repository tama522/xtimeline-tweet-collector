/**
 * GraphQL Response Parser
 * Extracts normalized tweet objects from X/Twitter GraphQL responses.
 * Based on xTap's parser (MIT License), simplified for local storage use.
 */

// Instruction paths per GraphQL endpoint
const INSTRUCTION_PATHS = {
  HomeTimeline: ['data', 'home', 'home_timeline_urt', 'instructions'],
  HomeLatestTimeline: ['data', 'home', 'home_timeline_urt', 'instructions'],
  UserTweets: ['data', 'user', 'result', 'timeline', 'timeline', 'instructions'],
  UserTweetsAndReplies: ['data', 'user', 'result', 'timeline', 'timeline', 'instructions'],
  UserMedia: ['data', 'user', 'result', 'timeline', 'timeline', 'instructions'],
  UserLikes: ['data', 'user', 'result', 'timeline', 'timeline', 'instructions'],
  UserArticlesTweets: ['data', 'user', 'result', 'timeline', 'timeline', 'instructions'],
  UserHighlightsTweets: ['data', 'user', 'result', 'timeline', 'timeline', 'instructions'],
  TweetDetail: ['data', 'threaded_conversation_with_injections_v2', 'instructions'],
  SearchTimeline: ['data', 'search_by_raw_query', 'search_timeline', 'timeline', 'instructions'],
  ListLatestTweetsTimeline: ['data', 'list', 'tweets_timeline', 'timeline', 'instructions'],
  Bookmarks: ['data', 'bookmark_timeline_v2', 'timeline', 'instructions'],
  Likes: ['data', 'user', 'result', 'timeline', 'timeline', 'instructions'],
  CommunityTweetsTimeline: ['data', 'communityResults', 'result', 'ranked_community_timeline', 'timeline', 'instructions'],
  BookmarkFolderTimeline: ['data', 'bookmark_collection_timeline', 'timeline', 'instructions'],
};

/**
 * Navigate a nested path in an object
 */
function navigatePath(obj, path) {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return null;
    current = current[key];
  }
  return current;
}

/**
 * Recursively search for an instructions array (fallback for unknown endpoints)
 */
function findInstructionsRecursive(obj, maxDepth) {
  if (maxDepth <= 0 || obj == null || typeof obj !== 'object') return null;
  if (Array.isArray(obj.instructions)) {
    const hasEntries = obj.instructions.some(i =>
      i.type === 'TimelineAddEntries' || i.entries || i.type === 'TimelineAddToModule'
    );
    if (hasEntries) return obj.instructions;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'instructions') continue;
    const result = findInstructionsRecursive(obj[key], maxDepth - 1);
    if (result) return result;
  }
  return null;
}

/**
 * Find instructions array in GraphQL response
 */
function findInstructions(endpoint, data) {
  const path = INSTRUCTION_PATHS[endpoint];
  if (path) {
    const result = navigatePath(data, path);
    if (result) return result;
  }
  return findInstructionsRecursive(data, 5);
}

/**
 * Unwrap tweet result (handle TweetWithVisibilityResults, etc.)
 */
function unwrapTweetResult(result) {
  if (!result) return null;
  // Direct tweet
  if (result.rest_id && result.legacy) return result;
  // TweetWithVisibilityResults wrapper
  if (result.tweet) return unwrapTweetResult(result.tweet);
  // TweetResult wrapper
  if (result.result) return unwrapTweetResult(result.result);
  return null;
}

/**
 * Normalize a raw tweet object from GraphQL into a clean structure
 */
function normalizeTweet(raw) {
  if (!raw || !raw.rest_id || !raw.legacy) return null;

  const legacy = raw.legacy;
  const core = raw.core?.user_results?.result;
  const author = core?.legacy;

  // Media extraction
  const media = (legacy.extended_entities?.media || legacy.entities?.media || []).map(m => ({
    type: m.type,
    url: m.media_url_https || m.video_info?.variants?.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))?.[0]?.url,
    width: m.sizes?.large?.w,
    height: m.sizes?.large?.h,
  }));

  // Engagement metrics
  const metrics = {
    likes: legacy.favorite_count || 0,
    retweets: legacy.retweet_count || 0,
    replies: legacy.reply_count || 0,
    views: parseInt(raw.views?.count || '0', 10) || 0,
    bookmarks: legacy.bookmark_count || 0,
    quotes: legacy.quote_count || 0,
  };

  return {
    id: raw.rest_id,
    url: `https://x.com/${author?.screen_name}/status/${raw.rest_id}`,
    created_at: legacy.created_at,
    captured_at: new Date().toISOString(),
    text: legacy.full_text || '',
    lang: legacy.lang,
    author: {
      id: core?.rest_id,
      username: author?.screen_name,
      display_name: author?.name,
      verified: author?.verified,
      is_blue_verified: author?.verified_type === 'Blue',
      follower_count: author?.followers_count,
      profile_image_url: author?.profile_image_url_https,
    },
    metrics,
    media,
    is_retweet: !!legacy.retweeted_status_result,
    retweeted_tweet_id: legacy.retweeted_status_result?.result?.rest_id || null,
    is_quote: !!legacy.is_quote_status,
    quoted_tweet_id: legacy.quoted_status_id_str || null,
    in_reply_to: legacy.in_reply_to_status_id_str || null,
    conversation_id: legacy.conversation_id_str,
    source_endpoint: null, // Set by caller
  };
}

/**
 * Extract tweets from a single timeline entry
 */
function extractFromEntry(entry) {
  const tweets = [];
  const content = entry.content || entry;

  // Cursor entries — skip
  if (content.entryType === 'TimelineTimelineCursor' || content.cursorType) {
    return tweets;
  }

  // TimelineTimelineItem (single tweet)
  if (content.entryType === 'TimelineTimelineItem' || content.itemContent) {
    const item = content.itemContent || content;
    const result = item?.tweet_results?.result;
    if (result) {
      const unwrapped = unwrapTweetResult(result);
      const tweet = normalizeTweet(unwrapped);
      if (tweet) tweets.push(tweet);
    }
    // Also check for conversation threads
    if (content.items) {
      for (const subItem of content.items) {
        const subResult = subItem.item?.itemContent?.tweet_results?.result;
        if (subResult) {
          const unwrapped = unwrapTweetResult(subResult);
          const tweet = normalizeTweet(unwrapped);
          if (tweet) tweets.push(tweet);
        }
      }
    }
  }

  // TimelineTimelineModule (e.g. conversation modules)
  if (content.entryType === 'TimelineTimelineModule' || content.items) {
    const items = content.items || [];
    for (const item of items) {
      const result = item.item?.itemContent?.tweet_results?.result ||
                     item.itemContent?.tweet_results?.result;
      if (result) {
        const unwrapped = unwrapTweetResult(result);
        const tweet = normalizeTweet(unwrapped);
        if (tweet) tweets.push(tweet);
      }
    }
  }

  return tweets;
}

/**
 * Main entry point: extract all tweets from a GraphQL response
 */
function extractTweets(endpoint, data) {
  if (!data) return [];

  // TweetResultByRestId returns a single tweet
  if (endpoint === 'TweetResultByRestId') {
    const result = data?.data?.tweetResult?.result;
    if (!result) return [];
    const raw = unwrapTweetResult(result);
    const tweet = normalizeTweet(raw);
    return tweet ? [tweet] : [];
  }

  const instructions = findInstructions(endpoint, data);
  if (!instructions || !Array.isArray(instructions)) return [];

  const tweets = [];
  for (const instruction of instructions) {
    const entries = instruction.entries || instruction.moduleItems || [];
    for (const entry of entries) {
      tweets.push(...extractFromEntry(entry));
    }
    // Some instructions have a single entry
    if (instruction.entry) {
      tweets.push(...extractFromEntry(instruction.entry));
    }
  }

  return tweets;
}
