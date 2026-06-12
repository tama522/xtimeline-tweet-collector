/**
 * GraphQL Response Parser
 * Extracts normalized tweets from X/Twitter GraphQL responses.
 * Handles multiple endpoint formats with fallback extraction.
 */

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
  // Possible alternate names X might use
  FollowingTimeline: ['data', 'home', 'home_timeline_urt', 'instructions'],
  ForYouTimeline: ['data', 'home', 'home_timeline_urt', 'instructions'],
  Timeline: ['data', 'home', 'home_timeline_urt', 'instructions'],
};

function navigatePath(obj, path) {
  let cur = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[k];
  }
  return cur;
}

function findInstructionsRecursive(obj, depth) {
  if (depth <= 0 || obj == null || typeof obj !== 'object') return null;
  if (Array.isArray(obj.instructions)) {
    if (obj.instructions.some(i => i.type === 'TimelineAddEntries' || i.entries || i.type === 'TimelineAddToModule'))
      return obj.instructions;
  }
  for (const key of Object.keys(obj)) {
    if (key === 'instructions') continue;
    const r = findInstructionsRecursive(obj[key], depth - 1);
    if (r) return r;
  }
  return null;
}

function findInstructions(endpoint, data) {
  const path = INSTRUCTION_PATHS[endpoint];
  if (path) {
    const r = navigatePath(data, path);
    if (r) return r;
  }
  return findInstructionsRecursive(data, 6);
}

function unwrapTweetResult(result) {
  if (!result) return null;
  if (result.rest_id && result.legacy) return result;
  if (result.tweet) return unwrapTweetResult(result.tweet);
  if (result.result) return unwrapTweetResult(result.result);
  // TweetWithVisibilityResults
  if (result.__typename === 'TweetWithVisibilityResults' && result.tweet) return unwrapTweetResult(result.tweet);
  return null;
}

/**
 * Normalize a raw tweet from GraphQL into a flat object
 * matching db.js schema and UI expectations
 */
function normalizeTweet(raw) {
  if (!raw || !raw.rest_id) return null;

  const legacy = raw.legacy;
  if (!legacy) return null;

  // Store structure info for debugging (caller reads this)
  if (!normalizeTweet._debugInfo) {
    const userResult = raw.core?.user_results?.result;
    const userLegacy = userResult?.legacy;
    const userCore = userResult?.core;
    normalizeTweet._debugInfo = {
      userLegacy: !!userLegacy,
      userLegacyKeys: userLegacy ? Object.keys(userLegacy).slice(0, 10).join(', ') : 'N/A',
      userCore: !!userCore,
      userCoreKeys: userCore ? Object.keys(userCore).join(', ') : 'N/A',
      userCoreName: userCore?.name || 'NULL',
      userCoreScreen: userCore?.screen_name || 'NULL',
      resultName: userResult?.name || 'NULL',
      resultScreen: userResult?.screen_name || 'NULL',
    };
  }

  // Author extraction - X API puts name/screen_name in user_results.result.core
  let authorName = '';
  let authorScreenName = '';
  let authorId = '';
  let profileImageUrl = '';

  const userResult = raw.core?.user_results?.result;
  const userCore = userResult?.core;
  const userLegacy = userResult?.legacy;

  // Primary: user_results.result.core (where X puts name/screen_name now)
  if (userCore) {
    authorName = userCore.name || '';
    authorScreenName = userCore.screen_name || '';
  }

  // Fallback: user_results.result.legacy (older API structure)
  if (!authorName && userLegacy) {
    authorName = userLegacy.name || '';
    authorScreenName = userLegacy.screen_name || '';
  }

  // Fallback: user_results.result directly
  if (!authorName && userResult) {
    authorName = userResult.name || '';
    authorScreenName = userResult.screen_name || '';
  }

  // Author ID
  authorId = userResult?.rest_id || '';

  // Profile image from legacy (always in legacy)
  profileImageUrl = userLegacy?.profile_image_url_https || '';

  // Media URLs
  const mediaUrls = [];
  for (const m of (legacy.extended_entities?.media || legacy.entities?.media || [])) {
    if (m.media_url_https) mediaUrls.push(m.media_url_https);
    if (m.video_info?.variants) {
      const best = m.video_info.variants
        .filter(v => v.bitrate != null)
        .sort((a, b) => b.bitrate - a.bitrate)[0];
      if (best?.url) mediaUrls.push(best.url);
    }
  }

  return {
    id: raw.rest_id,
    user_name: authorName,
    user_screen_name: authorScreenName,
    text: legacy.full_text || '',
    created_at: legacy.created_at || '',
    collected_at: new Date().toISOString(),
    retweet_count: legacy.retweet_count || 0,
    favorite_count: legacy.favorite_count || 0,
    reply_count: legacy.reply_count || 0,
    is_retweet: !!legacy.retweeted_status_result,
    media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
    url: authorScreenName
      ? `https://x.com/${authorScreenName}/status/${raw.rest_id}`
      : `https://x.com/i/status/${raw.rest_id}`,
    viewed_as: null,
    source_endpoint: null,
    conversation_id: legacy.conversation_id_str,
    lang: legacy.lang,
  };
}

function extractFromEntry(entry) {
  const tweets = [];
  const content = entry.content || entry;

  // Cursor
  if (content.entryType === 'TimelineTimelineCursor' || content.cursorType) return tweets;

  // TimelineTimelineItem
  if (content.entryType === 'TimelineTimelineItem' || content.itemContent) {
    const item = content.itemContent || content;
    const result = item?.tweet_results?.result;
    if (result) {
      const unwrapped = unwrapTweetResult(result);
      const tweet = normalizeTweet(unwrapped);
      if (tweet) tweets.push(tweet);
    }
    // Conversation threads
    if (content.items) {
      for (const sub of content.items) {
        const r = sub.item?.itemContent?.tweet_results?.result;
        if (r) {
          const u = unwrapTweetResult(r);
          const t = normalizeTweet(u);
          if (t) tweets.push(t);
        }
      }
    }
  }

  // TimelineTimelineModule
  if (content.entryType === 'TimelineTimelineModule' || content.items) {
    const items = content.items || [];
    for (const item of items) {
      const r = item.item?.itemContent?.tweet_results?.result ||
                item.itemContent?.tweet_results?.result;
      if (r) {
        const u = unwrapTweetResult(r);
        const t = normalizeTweet(u);
        if (t) tweets.push(t);
      }
    }
  }

  // Fallback: if entry has tweet_results directly
  if (tweets.length === 0 && content.tweet_results) {
    const u = unwrapTweetResult(content.tweet_results.result);
    const t = normalizeTweet(u);
    if (t) tweets.push(t);
  }

  return tweets;
}

/**
 * Main entry: extract all tweets from a GraphQL response
 */
function extractTweets(endpoint, data) {
  if (!data) return [];

  // Single tweet endpoint
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
    if (instruction.entry) {
      tweets.push(...extractFromEntry(instruction.entry));
    }
  }

  return tweets;
}
