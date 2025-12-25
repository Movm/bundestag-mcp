/**
 * Token estimation utilities for context window management
 *
 * Helps AI agents estimate data size before fetching to avoid
 * overwhelming their context window.
 */

/**
 * Token estimation ratios for different languages
 * German has more compound words, so fewer tokens per character
 */
const TOKEN_RATIOS = {
  german: 3.2,    // ~3.2 chars per token for German
  english: 4.0,   // ~4 chars per token for English
  mixed: 3.5      // Conservative estimate for mixed content
};

/**
 * Common context window sizes (in tokens)
 */
export const CONTEXT_WINDOWS = {
  'claude-3-haiku': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3.5-sonnet': 200000,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-3.5-turbo': 16385
};

/**
 * Estimate token count from text
 * @param {string} text - The text to estimate
 * @param {string} language - Language hint: 'german', 'english', 'mixed'
 * @returns {object} Size metrics
 */
export function estimateTokens(text, language = 'german') {
  if (!text || typeof text !== 'string') {
    return {
      characters: 0,
      words: 0,
      lines: 0,
      estimatedTokens: 0,
      language
    };
  }

  const characters = text.length;
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const lines = text.split('\n').length;
  const ratio = TOKEN_RATIOS[language] || TOKEN_RATIOS.mixed;
  const estimatedTokens = Math.ceil(characters / ratio);

  return {
    characters,
    words,
    lines,
    estimatedTokens,
    language
  };
}

/**
 * Get size category and recommendations
 * @param {number} estimatedTokens - Estimated token count
 * @returns {object} Size category and recommendations
 */
export function getSizeCategory(estimatedTokens) {
  if (estimatedTokens < 500) {
    return {
      category: 'tiny',
      emoji: '🟢',
      recommendation: 'Safe to fetch - minimal context impact',
      contextImpact: 'negligible'
    };
  } else if (estimatedTokens < 2000) {
    return {
      category: 'small',
      emoji: '🟢',
      recommendation: 'Safe to fetch - low context impact',
      contextImpact: 'low'
    };
  } else if (estimatedTokens < 8000) {
    return {
      category: 'medium',
      emoji: '🟡',
      recommendation: 'Consider if full text is needed - moderate context impact',
      contextImpact: 'moderate'
    };
  } else if (estimatedTokens < 25000) {
    return {
      category: 'large',
      emoji: '🟠',
      recommendation: 'Fetch only if essential - significant context impact. Consider extracting specific sections.',
      contextImpact: 'significant'
    };
  } else if (estimatedTokens < 50000) {
    return {
      category: 'very_large',
      emoji: '🔴',
      recommendation: 'Avoid fetching full text. Use text search or section extraction instead.',
      contextImpact: 'high'
    };
  } else {
    return {
      category: 'massive',
      emoji: '⛔',
      recommendation: 'Do NOT fetch full text. Use bundestag_search_*_text for specific content.',
      contextImpact: 'extreme'
    };
  }
}

/**
 * Calculate what percentage of context window this would use
 * @param {number} estimatedTokens - Estimated token count
 * @param {string} model - Model name (optional)
 * @returns {object} Context usage percentages
 */
export function getContextUsage(estimatedTokens, model = null) {
  const usage = {};

  if (model && CONTEXT_WINDOWS[model]) {
    usage[model] = {
      percentage: ((estimatedTokens / CONTEXT_WINDOWS[model]) * 100).toFixed(1),
      remaining: CONTEXT_WINDOWS[model] - estimatedTokens
    };
  } else {
    // Return for common models
    for (const [modelName, windowSize] of Object.entries(CONTEXT_WINDOWS)) {
      usage[modelName] = {
        percentage: ((estimatedTokens / windowSize) * 100).toFixed(1),
        remaining: windowSize - estimatedTokens
      };
    }
  }

  return usage;
}

/**
 * Full size analysis for a piece of text
 * @param {string} text - Text to analyze
 * @param {object} options - Options
 * @returns {object} Complete size analysis
 */
export function analyzeSize(text, options = {}) {
  const { language = 'german', model = null } = options;

  const metrics = estimateTokens(text, language);
  const category = getSizeCategory(metrics.estimatedTokens);
  const contextUsage = getContextUsage(metrics.estimatedTokens, model);

  return {
    ...metrics,
    ...category,
    contextUsage: model ? contextUsage[model] : contextUsage,
    summary: `${category.emoji} ${metrics.estimatedTokens.toLocaleString()} tokens (${category.category}) - ${category.recommendation}`
  };
}
