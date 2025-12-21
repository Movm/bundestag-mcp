/**
 * Client configuration generator tool
 */

import { z } from 'zod';

export const clientConfigTool = {
  name: 'get_client_config',
  description: 'Generate ready-to-use configuration for various MCP clients (Claude Desktop, Cursor, VS Code). Returns JSON that can be directly added to the respective config file.',

  inputSchema: {
    client: z.enum(['claude', 'cursor', 'vscode', 'chatgpt'])
      .describe('Which client to generate config for: claude, cursor, vscode, or chatgpt')
  },

  handler({ client }, baseUrl) {
    const configs = {
      claude: {
        description: 'Add this to your claude_desktop_config.json',
        configPath: {
          macos: '~/Library/Application Support/Claude/claude_desktop_config.json',
          windows: '%APPDATA%\\Claude\\claude_desktop_config.json',
          linux: '~/.config/Claude/claude_desktop_config.json'
        },
        config: {
          mcpServers: {
            bundestag: {
              url: `${baseUrl}/mcp`
            }
          }
        }
      },

      cursor: {
        description: 'Add this to your Cursor MCP configuration',
        configPath: {
          all: '.cursor/mcp.json in project folder or global in Cursor settings'
        },
        config: {
          mcpServers: {
            bundestag: {
              url: `${baseUrl}/mcp`
            }
          }
        }
      },

      vscode: {
        description: 'Add this to your VS Code settings.json (GitHub Copilot MCP)',
        configPath: {
          all: 'VS Code Settings (Cmd/Ctrl+,) → Search for "mcp"'
        },
        config: {
          'mcp.servers': {
            bundestag: {
              type: 'http',
              url: `${baseUrl}/mcp`
            }
          }
        }
      },

      chatgpt: {
        description: 'In ChatGPT: Settings → Connectors → Create',
        configPath: {
          all: 'ChatGPT Settings → Apps & Connectors → Connectors → Create'
        },
        config: {
          url: `${baseUrl}/mcp`,
          note: 'Paste the URL when creating a new connector'
        }
      }
    };

    const clientConfig = configs[client];

    return {
      client,
      serverUrl: `${baseUrl}/mcp`,
      ...clientConfig,
      instructions: [
        `1. ${clientConfig.description}`,
        '2. Copy the "config" into your configuration file',
        '3. Restart the application',
        '4. The Bundestag MCP Server should now be available'
      ]
    };
  }
};

export function generateClientConfigs(baseUrl) {
  return {
    claude: clientConfigTool.handler({ client: 'claude' }, baseUrl),
    cursor: clientConfigTool.handler({ client: 'cursor' }, baseUrl),
    vscode: clientConfigTool.handler({ client: 'vscode' }, baseUrl),
    chatgpt: clientConfigTool.handler({ client: 'chatgpt' }, baseUrl)
  };
}
