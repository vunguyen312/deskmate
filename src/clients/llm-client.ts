import type { ChatMessage, LlmConfig } from '../../shared/contract';
import { errorMessage, ServiceError } from '../utils/errors';
import { stripEmoji } from '../utils/sanitize';

const REQUEST_TIMEOUT_MS = 60_000;
const JSON_HEADERS: Record<string, string> = {
    'Content-Type': 'application/json',
};

interface LlmRequest {
    url: string;
    headers: Record<string, string>;
    body: string;
}

interface ChatResponseData {
    choices?: Array<{
        message?: { content?: unknown };
        finish_reason?: unknown;
    }>;
}

export class LlmClient {
    constructor(private readonly config: LlmConfig) {}

    public async chat(text: string, history: ChatMessage[]): Promise<string> {
        const messages: ChatMessage[] = [
            { role: 'system', content: this.config.systemPrompt },
            ...history,
            { role: 'user', content: text },
        ];
        const req = this.buildRequest(messages);
        const res = await this.post(req);
        if (!res.ok) {
            throw new ServiceError('llm', `HTTP ${res.status}`, res.status);
        }
        const data = (await res.json()) as ChatResponseData;
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            const reason = data.choices?.[0]?.finish_reason;
            const suffix = reason ? ` (${reason})` : '';
            throw new ServiceError(
                'llm',
                'empty reply' +
                    suffix +
                    ' — a thinking model likely exhausted the token budget; set llm.think=false or raise llm.maxTokens',
            );
        }
        
        
        const reply = stripEmoji(content).trim();
        if (!reply) {
            throw new ServiceError(
                'llm',
                'empty reply — output contained only emoji or non-speech characters',
            );
        }
        return reply;
    }

    private buildRequest(messages: ChatMessage[]): LlmRequest {
        const base = this.config.baseUrl.replace(/\/$/, '');
        const payload: Record<string, unknown> = {
            model: this.config.model,
            messages,
            max_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
            stream: false,
        };
        
        
        
        if (typeof this.config.think === 'boolean') {
            payload.chat_template_kwargs = {
                enable_thinking: this.config.think,
            };
        }
        if (typeof this.config.frequencyPenalty === 'number') {
            payload.frequency_penalty = this.config.frequencyPenalty;
        }
        if (typeof this.config.presencePenalty === 'number') {
            payload.presence_penalty = this.config.presencePenalty;
        }
        return {
            url: `${base}/v1/chat/completions`,
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
        };
    }

    private async post(req: LlmRequest): Promise<Response> {
        let res: Response;
        try {
            res = await fetch(req.url, {
                method: 'POST',
                headers: req.headers,
                body: req.body,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (err) {
            throw new ServiceError('llm', errorMessage(err));
        }
        return res;
    }
}