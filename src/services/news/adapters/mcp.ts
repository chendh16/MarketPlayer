/**
 * MCP (Model Context Protocol) 客户端实现
 */

import { logger } from '../../../utils/logger';

/**
 * MCP 调用参数（定义在此处，由 base.ts 再导出，以避免循环依赖）
 */
export interface MCPCallParams {
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
  timeout?: number;
}

/**
 * MCP 客户端配置
 */
interface MCPClientConfig {
  server: string;
  timeout?: number;
}

/**
 * MCP 客户端
 */
export class MCPClient {
  private server: string;
  private timeout: number;
  
  constructor(config: MCPClientConfig) {
    this.server = config.server;
    this.timeout = config.timeout || 30000;
  }
  
  /**
   * 调用 MCP 工具
   */
  async callTool(tool: string, args: Record<string, any>): Promise<any> {
    logger.debug(`Calling MCP tool: ${tool} on server: ${this.server}`);
    
    try {
      // MCP 协议调用
      const response = await fetch(`${this.server}/tools/${tool}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          arguments: args,
        }),
        signal: AbortSignal.timeout(this.timeout),
      });
      
      if (!response.ok) {
        throw new Error(`MCP call failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      logger.debug(`MCP tool ${tool} returned successfully`);
      
      return result;
    } catch (error: any) {
      logger.error(`MCP call failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 健康检查
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.server}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * 调用 MCP
 */
export async function callMCP(params: MCPCallParams): Promise<any> {
  const client = new MCPClient({
    server: params.server,
    timeout: params.timeout,
  });
  
  return await client.callTool(params.tool, params.arguments);
}

