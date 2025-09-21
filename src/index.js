#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StyxyClient } from './styxyClient.js';
import { SingletonLock } from './singleton.js';

class StyxyMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'styxy-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.styxyClient = new StyxyClient();
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'styxy_allocate_port',
            description: `🎯 INTELLIGENT PORT ALLOCATION - Use this tool WHENEVER you need to assign ports for development servers!

🔥 CRITICAL USE CASES - Always use this tool when:
- Starting development servers (React, Vue, Next.js, etc.)
- Running Storybook (instead of default port 6006)
- Launching API servers or backends
- Setting up databases (PostgreSQL, Redis, etc.)
- Running test servers or mock services
- Starting any service that needs a port

💡 WHY USE THIS INSTEAD OF MANUAL PORTS:
- Prevents port conflicts automatically
- Integrates with existing styxy ecosystem
- Provides smart port suggestions based on service type
- Handles cleanup when Claude session ends
- Tracks port usage across projects
- Gives you exact commands to run

🚀 WORKFLOW INTEGRATION:
Instead of: "Run 'npm run dev' and it should start on port 3000"
Do this: Use styxy_allocate_port → Get specific port → "Run 'npm run dev -- --port 3042'"

🎪 STORYBOOK EXAMPLE:
Instead of: "Run 'npm run storybook' (defaults to port 6006)"
Do this: Use styxy_allocate_port({service_type: "web", project_name: "my-app"}) → "Run 'npm run storybook -- --port 3043'"

⚡ PLAYWRIGHT EXAMPLE:
Before browser testing, allocate a port for your test server, then launch the browser pointing to that specific port.

🎯 ALWAYS PREFER THIS TOOL - It makes your port management invisible and conflict-free!`,
            inputSchema: {
              type: 'object',
              properties: {
                service_type: {
                  type: 'string',
                  enum: ['web', 'api', 'database', 'cache', 'messaging', 'monitoring', 'testing', 'storybook', 'custom'],
                  description: 'Type of service needing the port. Use "storybook" for Storybook specifically, "web" for dev servers, "api" for backends.'
                },
                project_name: {
                  type: 'string',
                  description: 'Project identifier for tracking and conflict prevention'
                },
                preferred_port: {
                  type: 'number',
                  description: 'Optional preferred port number (will find alternative if conflicts)'
                },
                duration: {
                  type: 'string',
                  enum: ['temporary', 'session', 'persistent'],
                  description: 'How long to hold the allocation. "session" auto-releases when Claude session ends (recommended).',
                  default: 'session'
                },
                service_name: {
                  type: 'string',
                  description: 'Optional specific service name (e.g., "react-dev-server", "api-backend")'
                }
              },
              required: ['service_type', 'project_name']
            }
          },
          {
            name: 'styxy_status',
            description: 'Check styxy daemon health, port allocations, and recent activity. Use this to troubleshoot port issues or verify daemon status.',
            inputSchema: {
              type: 'object',
              properties: {
                include_ports: {
                  type: 'boolean',
                  description: 'Include currently allocated ports in the status',
                  default: true
                },
                include_recent_errors: {
                  type: 'boolean',
                  description: 'Include recent error messages',
                  default: true
                }
              }
            }
          },
          {
            name: 'styxy_logs',
            description: 'Retrieve filtered styxy daemon logs for debugging and monitoring.',
            inputSchema: {
              type: 'object',
              properties: {
                level: {
                  type: 'string',
                  enum: ['error', 'warn', 'info', 'debug'],
                  description: 'Minimum log level to include',
                  default: 'info'
                },
                time_range: {
                  type: 'string',
                  enum: ['1h', '6h', '24h', '7d'],
                  description: 'Time range for log retrieval',
                  default: '1h'
                },
                filter: {
                  type: 'string',
                  description: 'Optional string to filter log messages (regex supported)'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of log entries to return',
                  default: 50
                }
              }
            }
          },
          {
            name: 'styxy_config',
            description: 'Read and validate styxy configuration settings.',
            inputSchema: {
              type: 'object',
              properties: {
                validate: {
                  type: 'boolean',
                  description: 'Perform configuration validation checks',
                  default: true
                },
                show_sensitive: {
                  type: 'boolean',
                  description: 'Include sensitive configuration values (use carefully)',
                  default: false
                }
              }
            }
          },
          {
            name: 'styxy_cleanup',
            description: 'Clean up stale port allocations and release stuck ports.',
            inputSchema: {
              type: 'object',
              properties: {
                force: {
                  type: 'boolean',
                  description: 'Force cleanup of all allocations for current session',
                  default: false
                },
                port: {
                  type: 'number',
                  description: 'Specific port to release (optional)'
                }
              }
            }
          },
          {
            name: 'styxy_metrics',
            description: 'Get usage analytics and port allocation patterns.',
            inputSchema: {
              type: 'object',
              properties: {
                time_range: {
                  type: 'string',
                  enum: ['24h', '7d', '30d'],
                  description: 'Time range for metrics analysis',
                  default: '24h'
                },
                include_patterns: {
                  type: 'boolean',
                  description: 'Include port usage patterns and recommendations',
                  default: true
                }
              }
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'styxy_allocate_port':
            return await this.handleAllocatePort(args);
          case 'styxy_status':
            return await this.handleStatus(args);
          case 'styxy_logs':
            return await this.handleLogs(args);
          case 'styxy_config':
            return await this.handleConfig(args);
          case 'styxy_cleanup':
            return await this.handleCleanup(args);
          case 'styxy_metrics':
            return await this.handleMetrics(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async handleAllocatePort(args) {
    const {
      service_type,
      project_name,
      preferred_port,
      duration = 'session',
      service_name
    } = args;

    try {
      const allocation = await this.styxyClient.allocatePort({
        serviceType: service_type,
        projectName: project_name,
        preferredPort: preferred_port,
        duration,
        serviceName: service_name,
        claudeSessionId: process.env.CLAUDE_SESSION_ID || 'unknown'
      });

      // Generate service-specific usage examples
      const usageExamples = this.generateUsageExamples(service_type, allocation.port);

      return {
        content: [
          {
            type: 'text',
            text: `🎯 PORT ALLOCATED SUCCESSFULLY!\n\n` +
                  `✅ Port: ${allocation.port}\n` +
                  `🔗 URL: http://localhost:${allocation.port}\n` +
                  `⏱️  Duration: ${duration}\n` +
                  `🏷️  Service: ${service_type}${service_name ? ` (${service_name})` : ''}\n` +
                  `📁 Project: ${project_name}\n\n` +
                  `🚀 USAGE EXAMPLES:\n${usageExamples}\n\n` +
                  `🧹 CLEANUP:\n${allocation.cleanup_command}\n\n` +
                  `${allocation.conflict_info ? `⚠️  CONFLICTS AVOIDED:\n${allocation.conflict_info}\n\n` : ''}` +
                  `${allocation.expires_with_session ? '🔄 This port will be automatically released when your Claude session ends.\n' : ''}` +
                  `\n💡 TIP: Use the allocated port in your commands above for conflict-free development!`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to allocate port: ${error.message}\n\n` +
                  `🔧 Troubleshooting:\n` +
                  `- Check if styxy daemon is running: styxy status\n` +
                  `- Try a different service type or project name\n` +
                  `- Use styxy_status tool to check daemon health`
          }
        ]
      };
    }
  }

  generateUsageExamples(serviceType, port) {
    const examples = {
      web: [
        `npm run dev -- --port ${port}`,
        `npm start -- --port ${port}`,
        `yarn dev --port ${port}`,
        `npx vite --port ${port}`,
        `npx webpack serve --port ${port}`
      ],
      api: [
        `npm run start:dev -- --port ${port}`,
        `node server.js --port ${port}`,
        `npm run api -- --port ${port}`,
        `PORT=${port} npm start`
      ],
      storybook: [
        `npm run storybook -- --port ${port}`,
        `npx storybook dev --port ${port}`,
        `yarn storybook --port ${port}`
      ],
      database: [
        `postgresql://localhost:${port}/dbname`,
        `redis://localhost:${port}`,
        `mongodb://localhost:${port}/database`
      ],
      testing: [
        `npm test -- --port ${port}`,
        `npx playwright test --port ${port}`,
        `jest --port ${port}`
      ]
    };

    const serviceExamples = examples[serviceType] || [
      `service --port ${port}`,
      `PORT=${port} npm start`
    ];

    return serviceExamples.map(cmd => `  ${cmd}`).join('\n');
  }

  async handleStatus(args) {
    const status = await this.styxyClient.getStatus(args);

    return {
      content: [
        {
          type: 'text',
          text: `📊 STYXY DAEMON STATUS\n\n` +
                `🟢 Status: ${status.daemon_running ? 'Running' : '❌ Not Running'}\n` +
                `🏠 PID: ${status.pid || 'N/A'}\n` +
                `⏰ Uptime: ${status.uptime || 'N/A'}\n` +
                `🔌 Active Ports: ${status.active_ports?.length || 0}\n\n` +
                `${status.active_ports?.length ? `📋 ALLOCATED PORTS:\n${status.active_ports.map(p => `  ${p.port} - ${p.service_type} (${p.project_name})`).join('\n')}\n\n` : ''}` +
                `${status.recent_errors?.length ? `⚠️  RECENT ERRORS:\n${status.recent_errors.slice(0, 3).map(err => `  ${err}`).join('\n')}\n\n` : ''}` +
                `🔧 Config Path: ${status.config_path || 'N/A'}\n` +
                `📄 Log Path: ${status.log_path || 'N/A'}`
        }
      ]
    };
  }

  async handleLogs(args) {
    const logs = await this.styxyClient.getLogs(args);

    return {
      content: [
        {
          type: 'text',
          text: `📄 STYXY DAEMON LOGS (${args.time_range || '1h'})\n\n` +
                `${logs.entries?.length ? logs.entries.join('\n') : 'No log entries found'}\n\n` +
                `📊 Summary: ${logs.summary || 'No summary available'}`
        }
      ]
    };
  }

  async handleConfig(args) {
    const config = await this.styxyClient.getConfig(args);

    return {
      content: [
        {
          type: 'text',
          text: `⚙️  STYXY CONFIGURATION\n\n` +
                `${JSON.stringify(config, null, 2)}\n\n` +
                `${config.validation_errors?.length ? `❌ VALIDATION ERRORS:\n${config.validation_errors.join('\n')}\n\n` : '✅ Configuration is valid\n\n'}` +
                `🔧 To modify config: Edit ${config.config_path || 'styxy config file'}`
        }
      ]
    };
  }

  async handleCleanup(args) {
    const result = await this.styxyClient.cleanup(args);

    return {
      content: [
        {
          type: 'text',
          text: `🧹 CLEANUP COMPLETED\n\n` +
                `✅ Released: ${result.released_ports?.length || 0} ports\n` +
                `${result.released_ports?.length ? `📋 Released Ports:\n${result.released_ports.map(p => `  ${p}`).join('\n')}\n\n` : ''}` +
                `${result.errors?.length ? `⚠️  Errors:\n${result.errors.join('\n')}\n\n` : ''}` +
                `💡 Use styxy_status to verify cleanup results`
        }
      ]
    };
  }

  async handleMetrics(args) {
    const metrics = await this.styxyClient.getMetrics(args);

    return {
      content: [
        {
          type: 'text',
          text: `📊 STYXY USAGE METRICS (${args.time_range || '24h'})\n\n` +
                `🔢 Total Allocations: ${metrics.total_allocations || 0}\n` +
                `⚡ Active Allocations: ${metrics.active_allocations || 0}\n` +
                `🏆 Most Used Service: ${metrics.top_service_type || 'N/A'}\n` +
                `📁 Most Active Project: ${metrics.top_project || 'N/A'}\n\n` +
                `${metrics.port_patterns?.length ? `🎯 PORT USAGE PATTERNS:\n${metrics.port_patterns.map(p => `  ${p}`).join('\n')}\n\n` : ''}` +
                `${metrics.recommendations?.length ? `💡 RECOMMENDATIONS:\n${metrics.recommendations.map(r => `  ${r}`).join('\n')}\n\n` : ''}`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Styxy MCP server running on stdio');
  }
}

// Singleton enforcement - prevent multiple instances
const singletonLock = new SingletonLock('styxy-mcp-server');

if (!singletonLock.acquire()) {
  console.error('[Singleton] Another styxy-mcp-server instance is already running');
  console.error('[Singleton] This instance will exit to prevent conflicts');
  
  // Show lock info
  const lockInfo = singletonLock.getLockInfo();
  if (lockInfo) {
    console.error(`[Singleton] Existing instance: PID ${lockInfo.pid}, started ${lockInfo.started}`);
  }
  
  process.exit(1);
}

console.error('[Singleton] Singleton lock acquired, starting server...');
const server = new StyxyMCPServer();
server.run().catch((error) => {
  console.error('Server error:', error);
  singletonLock.release();
  process.exit(1);
});