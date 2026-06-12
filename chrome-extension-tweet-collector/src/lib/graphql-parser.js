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
  // Discover more / recommendations
  TweetRecommendations: ['data', 'message', 'tweet_results', 'result'],
  RelatedTweets: ['data', 'message', 'tweet_results', 'result'],
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
    const userCore = userResult?.core;
    const userLegacy = userResult?.legacy;
    normalizeTweet._debugInfo = {
      userLegacy: !!userLegacy,
      userLegacyKeys: userLegacy ? Object.keys(userLegacy).slice(0, 10).join(', ') : 'N/A',
      userCore: !!userCore,
      userCoreKeys: userCore ? Object.keys(userCore).join(', ') : 'N/A',
      userCoreName: userCore?.name || 'NULL',
      userCoreScreen: userCore?.screen_name || 'NULL',
      resultName: userResult?.name || 'NULL',
      resultScreen: userResult?.screen_name || 'NULL',
      // Translation fields
      hasNoteTweet: !!raw.note_tweet,
      noteTweetKeys: raw.note_tweet ? Object.keys(raw.note_tweet).join(', ') : 'N/A',
      hasTranslation: !!legacy.extended_entities?.translation,
      translationKeys: legacy.extended_entities?.translation ? Object.keys(legacy.extended_entities.translation) : 'N/A',
      legacyTranslation: !!legacy.translation,
      lang: legacy.lang,
      grokTranslated: !!raw.grok_translated_post_with_availability,
      grokKeys: raw.grok_translated_post_with_availability ? Object.keys(raw.grok_translated_post_with_availability).join(', ') : null,
      grokData: raw.grok_translated_post_with_availability?.data ? JSON.stringify(raw.grok_translated_post_with_availability.data).slice(0, 200) : null,
      grokAvailable: raw.grok_translated_post_with_availability?.is_available,
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
        tweets.push(...extractFromEntry(sub));
      }
    }
  }

  // TimelineTimelineModule (includes "Discover more" sections)
  if (content.entryType === 'TimelineTimelineModule' || content.items) {
    const items = content.items || [];
    for (const item of items) {
      // Try multiple paths
      const r = item.item?.itemContent?.tweet_results?.result ||
                item.itemContent?.tweet_results?.result ||
                item.tweet_results?.result;
      if (r) {
        const u = unwrapTweetResult(r);
        const t = normalizeTweet(u);
        if (t) tweets.push(t);
      }
      // Recurse into nested items
      if (item.item?.items) {
        for (const sub of item.item.items) {
          tweets.push(...extractFromEntry(sub));
        }
      }
    }
  }

  // Fallback: direct tweet_results
  if (tweets.length === 0 && content.tweet_results) {
    const u = unwrapTweetResult(content.tweet_results.result);
    const t = normalizeTweet(u);
    if (t) tweets.push(t);
  }

  // Deep fallback: search for any tweet_results in the entry
  if (tweets.length === 0) {
    const found = findTweetsDeep(entry, 3);
    tweets.push(...found);
  }

  return tweets;
}

/**
 * Recursively search for tweet_results in nested structures
 */
function findTweetsDeep(obj, depth) {
  if (depth <= 0 || obj == null || typeof obj !== 'object') return [];
  const tweets = [];

  if (obj.tweet_results?.result) {
    const u = unwrapTweetResult(obj.tweet_results.result);
    const t = normalizeTweet(u);
    if (t) return [t];
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      tweets.push(...findTweetsDeep(item, depth - 1));
    }
  } else {
    for (const key of Object.keys(obj)) {
      if (key === 'tweet_results') continue;
      tweets.push(...findTweetsDeep(obj[key], depth - 1));
    }
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
