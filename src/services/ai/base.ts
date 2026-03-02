/**
 * AI 服务基础接口
 * 支持多种 AI 提供商的统一接口
 */
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}

export interface AIProvider {
  /**
   * 发送消息到 AI 服务
   */
  sendMessage(messages: AIMessage[], options?: AIOptions): Promise<AIResponse>;
  
  /**
   * 获取提供商名称
   */
  getProviderName(): string;
  
  /**
   * 估算成本（美元）
   */
  estimateCost(inputTokens: number, outputTokens: number): number;
}

export interface AIOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

/**
 * AI 提供商工厂
 */
export class AIProviderFactory {
  static create(provider: string, apiKey: string, baseUrl?: string, model?: string): AIProvider {
    switch (provider.toLowerCase()) {
      case 'anthropic':
        return new AnthropicProvider(apiKey, model);
      case 'openai':
        return new OpenAIProvider(apiKey, baseUrl, model);
      case 'azure':
        return new AzureProvider(apiKey, baseUrl!, model);
      case 'custom':
        return new CustomProvider(apiKey, baseUrl!, model);
      case 'zhipu':
        return new ZhipuProvider(apiKey, model);
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }
}

/**
 * Anthropic Claude 提供商
 */
class AnthropicProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || 'claude-sonnet-4-20250514';
  }

  async sendMessage(messages: AIMessage[], options?: AIOptions): Promise<AIResponse> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const systemPrompt = options?.systemPrompt
      || messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n')
      || undefined;

    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.7,
      system: systemPrompt,
      messages: chatMessages,
    });

    const firstBlock = response.content[0];
    const content = firstBlock?.type === 'text' ? firstBlock.text : '';

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: this.model,
    };
  }

  getProviderName(): string {
    return 'Anthropic';
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    // Claude Sonnet 4 定价：$3/M input, $15/M output
    return (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
  }
}

/**
 * OpenAI 提供商
 */
class OpenAIProvider implements AIProvider {
  private apiKey: string;
  private baseUrl?: string;
  private model: string;

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model || 'gpt-4-turbo-preview';
  }

  async sendMessage(messages: AIMessage[], options?: AIOptions): Promise<AIResponse> {
    const baseURL = this.baseUrl || 'https://api.openai.com/v1';
    const response = await axios.post(`${baseURL}/chat/completions`, {
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.7,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return {
      content: response.data.choices?.[0]?.message?.content || '',
      usage: {
        inputTokens: response.data.usage?.prompt_tokens || 0,
        outputTokens: response.data.usage?.completion_tokens || 0,
      },
      model: this.model,
    };
  }

  getProviderName(): string {
    return 'OpenAI';
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    // GPT-4 Turbo 定价：$10/M input, $30/M output
    return (inputTokens / 1_000_000) * 10 + (outputTokens / 1_000_000) * 30;
  }
}

/**
 * Azure OpenAI 提供商
 */
class AzureProvider implements AIProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, baseUrl: string, model?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model || 'gpt-4';
  }

  async sendMessage(messages: AIMessage[], options?: AIOptions): Promise<AIResponse> {
    const response = await axios.post(`${this.baseUrl}/chat/completions`, {
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.7,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }, {
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    return {
      content: response.data.choices?.[0]?.message?.content || '',
      usage: {
        inputTokens: response.data.usage?.prompt_tokens || 0,
        outputTokens: response.data.usage?.completion_tokens || 0,
      },
      model: this.model,
    };
  }

  getProviderName(): string {
    return 'Azure OpenAI';
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    // Azure 定价与 OpenAI 类似
    return (inputTokens / 1_000_000) * 10 + (outputTokens / 1_000_000) * 30;
  }
}

/**
 * 智谱 AI GLM 提供商（兼容 OpenAI 格式）
 */
class ZhipuProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private static readonly BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || 'glm-4-flash';
  }

  async sendMessage(messages: AIMessage[], options?: AIOptions): Promise<AIResponse> {
    const response = await axios.post(`${ZhipuProvider.BASE_URL}/chat/completions`, {
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.7,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return {
      content: response.data.choices?.[0]?.message?.content || '',
      usage: {
        inputTokens: response.data.usage?.prompt_tokens || 0,
        outputTokens: response.data.usage?.completion_tokens || 0,
      },
      model: this.model,
    };
  }

  getProviderName(): string {
    return 'Zhipu GLM';
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    // glm-4-flash 免费；glm-4-plus 约 ¥0.05/1K tokens
    return (inputTokens / 1_000_000) * 0.1 + (outputTokens / 1_000_000) * 0.1;
  }
}

/**
 * 自定义 API 提供商（兼容 OpenAI 格式）
 */
class CustomProvider implements AIProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, baseUrl: string, model?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model || 'default';
  }

  async sendMessage(messages: AIMessage[], options?: AIOptions): Promise<AIResponse> {
    const response = await axios.post(`${this.baseUrl}/chat/completions`, {
      model: this.model,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.7,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return {
      content: response.data.choices?.[0]?.message?.content || '',
      usage: {
        inputTokens: response.data.usage?.prompt_tokens || 0,
        outputTokens: response.data.usage?.completion_tokens || 0,
      },
      model: this.model,
    };
  }

  getProviderName(): string {
    return 'Custom API';
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    // 自定义 API 使用默认估算
    return (inputTokens / 1_000_000) * 5 + (outputTokens / 1_000_000) * 15;
  }
}
