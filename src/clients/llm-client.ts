import { ChatOpenAI } from '@langchain/openai';
import {
    AIMessage,
    HumanMessage,
    SystemMessage,
} from '@langchain/core/messages';
import type { ChatMessage, LlmConfig } from '../../shared/contract';
import { errorMessage, ServiceError } from '../utils/errors';
import { stripEmoji } from '../utils/sanitize';

const REQUEST_TIMEOUT_MS = 60_000;

export class LlmClient {
    private readonly llm: ChatOpenAI;

    constructor(private readonly config: LlmConfig) {
        const base = config.baseUrl.replace(/\/$/, '');
        this.llm = new ChatOpenAI({
            model: config.model,

            apiKey: 'not-needed',
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            frequencyPenalty: config.frequencyPenalty ?? 0,
            presencePenalty: config.presencePenalty ?? 0,
            timeout: REQUEST_TIMEOUT_MS,
            ...(typeof config.think === 'boolean'
                ? {
                      modelKwargs: {
                          chat_template_kwargs: {
                              enable_thinking: config.think,
                          },
                      },
                  }
                : {}),
            configuration: { baseURL: `${base}/v1` },
        });
    }

    public async chat(
        text: string,
        history: ChatMessage[],
        memory?: string,
    ): Promise<string> {
        const content = await this.invoke(text, history, memory);
        if (typeof content !== 'string' || !content.trim()) {
            throw new ServiceError(
                'llm',
                'empty reply — a thinking model likely exhausted the token budget; set llm.think=false or raise llm.maxTokens',
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

    private async invoke(
        text: string,
        history: ChatMessage[],
        memory?: string,
    ): Promise<unknown> {
        const system = [this.config.systemPrompt, memory]
            .filter((s): s is string => Boolean(s))
            .join('\n\n');
        const messages = [
            new SystemMessage(system),
            ...history.map((m) =>
                m.role === 'user'
                    ? new HumanMessage(m.content)
                    : m.role === 'assistant'
                      ? new AIMessage(m.content)
                      : new SystemMessage(m.content),
            ),
            new HumanMessage(text),
        ];
        try {
            const res = await this.llm.invoke(messages);
            return res.content;
        } catch (err) {
            throw new ServiceError('llm', errorMessage(err));
        }
    }
}
