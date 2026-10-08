const API_URL = 'https://api.anthropic.com/v1/messages';

export class AnthropicClient {
  constructor({
    apiKey = process.env.ANTHROPIC_API_KEY,
    model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
    fetchImpl = fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
  }

  async completeJson({ system, prompt, maxTokens = 4096 }) {
    if (!this.apiKey) {
      const error = new Error('ANTHROPIC_API_KEY is not configured.');
      error.statusCode = 503;
      throw error;
    }

    const response = await this.fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      const error = new Error(`Anthropic request failed (${response.status}): ${detail.slice(0, 500)}`);
      error.statusCode = 502;
      throw error;
    }

    const payload = await response.json();
    const text = payload.content
      ?.filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    if (!text) {
      const error = new Error('Anthropic returned an empty response.');
      error.statusCode = 502;
      throw error;
    }

    try {
      return JSON.parse(stripJsonFence(text));
    } catch {
      const error = new Error('Anthropic returned invalid JSON.');
      error.statusCode = 502;
      throw error;
    }
  }
}

function stripJsonFence(value) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}
