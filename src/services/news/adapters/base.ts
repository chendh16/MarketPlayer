/**
 * 资讯获取适配器基础接口
 * 支持多种数据源：传统 API、Skill、MCP 等
 */

import { NewsItem } from '../../../models/signal';
import { Market } from '../../../types/market';
import { callMCP, MCPCallParams } from './mcp';

/**
 * 资讯获取结果
 */
export interface NewsResult {
  items: Partial<NewsItem>[];
  source: string;
  fetchedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 资讯获取适配器接口
 */
export interface NewsAdapter {
  /**
   * 获取资讯
   */
  fetchNews(params: NewsFetchParams): Promise<NewsResult>;

  /**
   * 获取适配器名称
   */
  getName(): string;

  /**
   * 获取适配器类型
   */
  getType(): 'api' | 'skill' | 'mcp' | 'custom';

  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>;
}

/**
 * 资讯获取参数
 */
export interface NewsFetchParams {
  market: Market;
  symbols?: string[];
  limit?: number;
  since?: Date;
  keywords?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Skill 调用参数
 */
export interface SkillCallParams {
  skillName: string;
  action: string;
  parameters: Record<string, unknown>;
  timeout?: number;
}

// MCPCallParams is defined in ./mcp and re-exported here for backward compatibility
export type { MCPCallParams };

// ─── 内部 config 类型定义 ────────────────────────────────────────────────────

interface APIAdapterConfig {
  name?: string;
  endpoint: string;
  apiKey?: string;
  timeout?: number;
}

interface SkillAdapterConfig {
  skillName: string;
  skillEndpoint?: string;
  endpoint?: string;
  timeout?: number;
}

interface MCPAdapterConfig {
  server: string;
  tool?: string;
  timeout?: number;
}

interface CustomAdapterConfig {
  name?: string;
  fetchFunction?: (params: NewsFetchParams) => Promise<NewsResult>;
  healthCheckFunction?: () => Promise<boolean>;
}

// ─── 工厂支持的 config 联合类型 ──────────────────────────────────────────────

type AdapterConfig =
  | APIAdapterConfig
  | SkillAdapterConfig
  | MCPAdapterConfig
  | CustomAdapterConfig;

/**
 * 资讯适配器工厂
 */
export class NewsAdapterFactory {
  private static adapters: Map<string, NewsAdapter> = new Map();

  /**
   * 注册适配器
   */
  static register(name: string, adapter: NewsAdapter): void {
    this.adapters.set(name, adapter);
  }

  /**
   * 获取适配器
   */
  static get(name: string): NewsAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * 获取所有适配器
   */
  static getAll(): NewsAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 创建适配器
   */
  static create(type: string, config: AdapterConfig): NewsAdapter {
    switch (type.toLowerCase()) {
      case 'api':
        return new APINewsAdapter(config as APIAdapterConfig);
      case 'skill':
        return new SkillNewsAdapter(config as SkillAdapterConfig);
      case 'mcp':
        return new MCPNewsAdapter(config as MCPAdapterConfig);
      case 'custom':
        return new CustomNewsAdapter(config as CustomAdapterConfig);
      default:
        throw new Error(`Unsupported news adapter type: ${type}`);
    }
  }
}

/**
 * 传统 API 适配器
 */
class APINewsAdapter implements NewsAdapter {
  private config: APIAdapterConfig;

  constructor(config: APIAdapterConfig) {
    this.config = config;
  }

  async fetchNews(params: NewsFetchParams): Promise<NewsResult> {
    const timeout = this.config.timeout ?? 15000;
    let response: Response;
    try {
      response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      throw new Error(
        `APINewsAdapter: HTTP request failed for endpoint "${this.config.endpoint}": ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `APINewsAdapter: endpoint "${this.config.endpoint}" returned HTTP ${response.status}: ${text}`,
      );
    }

    const data = await response.json() as { items?: Partial<NewsItem>[]; metadata?: Record<string, unknown> };

    return {
      items: data.items ?? [],
      source: this.config.name ?? 'API Adapter',
      fetchedAt: new Date(),
      metadata: data.metadata,
    };
  }

  getName(): string {
    return this.config.name ?? 'API Adapter';
  }

  getType(): 'api' {
    return 'api';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.endpoint}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Skill 适配器
 */
class SkillNewsAdapter implements NewsAdapter {
  private config: SkillAdapterConfig;

  constructor(config: SkillAdapterConfig) {
    this.config = config;
  }

  async fetchNews(params: NewsFetchParams): Promise<NewsResult> {
    const skillResult = await this.callSkill({
      skillName: this.config.skillName,
      action: 'fetchNews',
      parameters: params as unknown as Record<string, unknown>,
      timeout: this.config.timeout ?? 30000,
    });

    return {
      items: skillResult.items ?? [],
      source: `Skill: ${this.config.skillName}`,
      fetchedAt: new Date(),
      metadata: skillResult.metadata,
    };
  }

  private async callSkill(params: SkillCallParams): Promise<{ items: Partial<NewsItem>[]; metadata?: Record<string, unknown> }> {
    const endpoint: string | undefined = this.config.skillEndpoint ?? this.config.endpoint;

    if (!endpoint) {
      throw new Error(`SkillNewsAdapter: no endpoint configured for skill "${params.skillName}"`);
    }

    const timeout = params.timeout ?? this.config.timeout ?? 30000;

    const body = JSON.stringify({
      skill: params.skillName,
      action: params.action,
      parameters: params.parameters,
      timeout,
    });

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      throw new Error(
        `SkillNewsAdapter: HTTP request failed for skill "${params.skillName}" at ${endpoint}: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `SkillNewsAdapter: skill "${params.skillName}" returned HTTP ${response.status}: ${text}`,
      );
    }

    const data = await response.json() as { items?: Partial<NewsItem>[]; metadata?: Record<string, unknown> };

    return {
      items: data.items ?? [],
      metadata: data.metadata,
    };
  }

  getName(): string {
    return `Skill: ${this.config.skillName}`;
  }

  getType(): 'skill' {
    return 'skill';
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}


/**
 * MCP (Model Context Protocol) 适配器
 */
class MCPNewsAdapter implements NewsAdapter {
  private config: MCPAdapterConfig;

  constructor(config: MCPAdapterConfig) {
    this.config = config;
  }

  async fetchNews(params: NewsFetchParams): Promise<NewsResult> {
    const mcpResult = await callMCP({
      server: this.config.server,
      tool: this.config.tool ?? 'fetch_news',
      arguments: params as unknown as Record<string, unknown>,
      timeout: this.config.timeout ?? 30000,
    }) as { items?: Partial<NewsItem>[]; metadata?: Record<string, unknown> };

    return {
      items: mcpResult.items ?? [],
      source: `MCP: ${this.config.server}`,
      fetchedAt: new Date(),
      metadata: mcpResult.metadata,
    };
  }

  getName(): string {
    return `MCP: ${this.config.server}`;
  }

  getType(): 'mcp' {
    return 'mcp';
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * 自定义适配器
 */
class CustomNewsAdapter implements NewsAdapter {
  private config: CustomAdapterConfig;

  constructor(config: CustomAdapterConfig) {
    this.config = config;
  }

  async fetchNews(params: NewsFetchParams): Promise<NewsResult> {
    if (this.config.fetchFunction) {
      return await this.config.fetchFunction(params);
    }

    throw new Error('Custom adapter requires fetchFunction');
  }

  getName(): string {
    return this.config.name ?? 'Custom Adapter';
  }

  getType(): 'custom' {
    return 'custom';
  }

  async healthCheck(): Promise<boolean> {
    if (this.config.healthCheckFunction) {
      return await this.config.healthCheckFunction();
    }
    return true;
  }
}
