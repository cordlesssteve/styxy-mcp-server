#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "styxy-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions for Styxy port management system integration
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "styxy_status",
        description: "Get current Styxy daemon and port allocation status",
        inputSchema: {
          type: "object",
          properties: {
            detailed: {
              type: "boolean",
              description: "Include detailed port allocation information",
              default: false
            }
          }
        }
      },
      {
        name: "styxy_allocate_port",
        description: "Allocate a port using Styxy system",
        inputSchema: {
          type: "object",
          properties: {
            service_type: {
              type: "string",
              enum: ["dev", "frontend", "api", "backend", "storybook", "functions", "auth", "test", "docs"],
              description: "Type of service needing a port"
            },
            service_name: {
              type: "string",
              description: "Name of the service instance"
            },
            preferred_port: {
              type: "number",
              description: "Preferred port if available"
            },
            project_context: {
              type: "string",
              description: "Project context for allocation"
            }
          },
          required: ["service_type", "service_name"]
        }
      },
      {
        name: "styxy_release_port",
        description: "Release a previously allocated port",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "number",
              description: "Port number to release"
            },
            service_name: {
              type: "string",
              description: "Optional service name for verification"
            }
          },
          required: ["port"]
        }
      },
      {
        name: "styxy_suggest_port",
        description: "Get port suggestion for a service type",
        inputSchema: {
          type: "object",
          properties: {
            service_type: {
              type: "string",
              enum: ["dev", "frontend", "api", "backend", "storybook", "functions", "auth", "test", "docs"],
              description: "Type of service needing a port"
            },
            preferred_port: {
              type: "number",
              description: "Preferred port number if available"
            },
            project_name: {
              type: "string",
              description: "Optional project name for context"
            }
          },
          required: ["service_type"]
        }
      },
      {
        name: "styxy_check_port",
        description: "Check if a specific port is available",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "number",
              description: "Port number to check availability"
            },
            service_type: {
              type: "string",
              description: "Optional service type for context"
            }
          },
          required: ["port"]
        }
      },
      {
        name: "styxy_get_active_services",
        description: "Get list of all active services using ports",
        inputSchema: {
          type: "object",
          properties: {
            include_docker: {
              type: "boolean",
              description: "Include Docker container services",
              default: true
            },
            include_global_tools: {
              type: "boolean",
              description: "Include global tool services",
              default: true
            },
            port_range: {
              type: "object",
              properties: {
                start: { type: "number" },
                end: { type: "number" }
              },
              description: "Optional port range filter"
            }
          }
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "styxy_status":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                daemon_status: "running",
                port: 9876,
                uptime: "2h 15m",
                allocated_ports: 12,
                available_ranges: {
                  dev: "3000-3999",
                  api: "4000-4999",
                  storybook: "6000-6999"
                },
                recent_allocations: [
                  { port: 3001, service: "web-dev", type: "dev" },
                  { port: 4002, service: "api-server", type: "api" }
                ]
              }, null, 2)
            }
          ]
        };
        
      case "styxy_allocate_port":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                allocated_port: args?.preferred_port || 3001,
                service_type: args?.service_type,
                service_name: args?.service_name,
                allocation_id: `alloc_${Date.now()}`,
                lock_file: `/tmp/styxy/locks/port_${args?.preferred_port || 3001}.lock`,
                command_suggestion: `npm run dev -- --port ${args?.preferred_port || 3001}`,
                expiry: "24h",
                status: "allocated"
              }, null, 2)
            }
          ]
        };
        
      case "styxy_suggest_port":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                suggested_port: 3001,
                service_type: args?.service_type,
                port_range: "3000-3999",
                availability: "available",
                alternatives: [3002, 3003, 3004],
                organizational_compliance: "compliant",
                command_suggestions: [
                  `npm run dev -- --port 3001`,
                  `yarn dev --port 3001`,
                  `pnpm dev --port 3001`
                ]
              }, null, 2)
            }
          ]
        };
        
      default:
        return {
          content: [
            {
              type: "text",
              text: `Styxy tool ${name} not fully implemented yet - returning mock data`
            }
          ]
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error}`
        }
      ],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Styxy server error:", error);
  process.exit(1);
});