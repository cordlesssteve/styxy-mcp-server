# Styxy MCP Server

**Smart Port Management for Claude Code** 🎯

An MCP (Model Context Protocol) server that provides Claude Code with intelligent port allocation and management through the styxy daemon system.

## 🚀 Features

### Core Tools

- **`styxy_allocate_port`** - 🎯 Smart port allocation with conflict detection
- **`styxy_status`** - 📊 Daemon health monitoring and port overview
- **`styxy_logs`** - 📄 Filtered log access for debugging
- **`styxy_config`** - ⚙️ Configuration reading and validation
- **`styxy_cleanup`** - 🧹 Stale allocation cleanup
- **`styxy_metrics`** - 📈 Usage analytics and patterns

### Key Benefits

✅ **Automatic Conflict Prevention** - No more "port already in use" errors
✅ **Service-Aware Allocation** - Different strategies for web, API, database services
✅ **Session Management** - Ports auto-release when Claude session ends
✅ **CLI Fallback** - Works even when daemon is offline
✅ **Rich Guidance** - Provides exact commands for your service type

## 📦 Installation

```bash
cd ~/mcp-servers/styxy-server
npm install
```

## ⚙️ Configuration

### 1. Add to Claude Code MCP Configuration

Add to your `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "styxy": {
      "command": "node",
      "args": ["/home/cordlesssteve/mcp-servers/styxy-server/src/index.js"]
    }
  }
}
```

### 2. Grant Tool Permissions

Add to your project's `.settings.local.json`:

```json
{
  "allowedMcpTools": [
    "mcp__styxy__styxy_allocate_port",
    "mcp__styxy__styxy_status",
    "mcp__styxy__styxy_logs",
    "mcp__styxy__styxy_config",
    "mcp__styxy__styxy_cleanup",
    "mcp__styxy__styxy_metrics"
  ]
}
```

### 3. Ensure Styxy Daemon

The MCP server requires the styxy daemon to be running:

```bash
# Start daemon
styxy daemon start

# Check status
styxy status

# View logs
styxy logs
```

## 🎯 Usage Examples

### Smart Port Allocation

**Before (Manual):**
```
Claude: "Run 'npm run dev' and it should start on port 3000"
User: [Gets port conflict error]
```

**After (With Styxy MCP):**
```
Claude: [Uses styxy_allocate_port()]
Claude: "✅ Port 3042 allocated! Run: npm run dev -- --port 3042"
User: [No conflicts, works perfectly]
```

### Service-Specific Examples

**React Development:**
```javascript
// Claude uses: styxy_allocate_port({
//   service_type: "web",
//   project_name: "my-react-app"
// })
// Result: "Run: npm run dev -- --port 3043"
```

**Storybook:**
```javascript
// Claude uses: styxy_allocate_port({
//   service_type: "storybook",
//   project_name: "component-library"
// })
// Result: "Run: npm run storybook -- --port 6007"
```

**API Server:**
```javascript
// Claude uses: styxy_allocate_port({
//   service_type: "api",
//   project_name: "backend-service"
// })
// Result: "Run: PORT=3044 npm start"
```

## 🔧 Tool Reference

### styxy_allocate_port

**The main tool** - Use this whenever Claude needs to assign ports!

```typescript
{
  service_type: "web" | "api" | "database" | "cache" | "messaging" | "monitoring" | "testing" | "storybook" | "custom",
  project_name: string,           // Required: Project identifier
  preferred_port?: number,        // Optional: Preferred port number
  duration?: "temporary" | "session" | "persistent", // Default: "session"
  service_name?: string          // Optional: Specific service name
}
```

**Returns:**
- Allocated port number
- Service URL (http://localhost:PORT)
- Cleanup command
- Usage examples for your service type
- Conflict information if any

### styxy_status

Quick health check of the styxy daemon:

```typescript
{
  include_ports?: boolean,        // Default: true
  include_recent_errors?: boolean // Default: true
}
```

### styxy_logs

Filtered log access for debugging:

```typescript
{
  level?: "error" | "warn" | "info" | "debug", // Default: "info"
  time_range?: "1h" | "6h" | "24h" | "7d",    // Default: "1h"
  filter?: string,                             // Optional: regex filter
  limit?: number                               // Default: 50
}
```

### styxy_cleanup

Clean up stale allocations:

```typescript
{
  force?: boolean,    // Force cleanup all session allocations
  port?: number      // Release specific port
}
```

## 🔄 Communication Architecture

```
Claude Code → MCP Server → Styxy Daemon → Port Allocation
                      ↘ CLI Fallback (if daemon offline)
```

### Daemon Communication
- **Primary**: Unix socket (`~/.styxy/daemon.sock`)
- **Fallback**: CLI commands (`styxy allocate`, `styxy status`, etc.)
- **Timeout**: 5 seconds for socket, 10 seconds for commands

### Error Handling
- Graceful fallback from socket to CLI
- Detailed error messages with troubleshooting tips
- Automatic retry logic for transient failures

## 🛠️ Development

### Running the Server
```bash
# Development mode (with file watching)
npm run dev

# Production mode
npm start

# Testing
npm test
```

### Testing with Claude Code

1. **Start the MCP server:**
   ```bash
   cd ~/mcp-servers/styxy-server
   npm start
   ```

2. **Test in Claude Code:**
   ```
   /mcp styxy_status
   /mcp styxy_allocate_port {"service_type": "web", "project_name": "test"}
   ```

### Debugging

**Check MCP Server Status:**
```bash
# Test if server responds
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node src/index.js

# Check permissions
claude mcp list | grep styxy
```

**Check Styxy Daemon:**
```bash
styxy status
styxy logs --tail 50
```

## 📋 Integration Checklist

- [ ] MCP server added to `~/.claude/mcp.json`
- [ ] Tools granted in project `.settings.local.json`
- [ ] Styxy daemon running (`styxy daemon start`)
- [ ] Test allocation works (`/mcp styxy_allocate_port`)
- [ ] Verify port cleanup (`/mcp styxy_cleanup`)

## 🐛 Troubleshooting

**"Daemon not reachable"**
```bash
styxy daemon start
styxy status
```

**"Permission denied"**
- Check `.settings.local.json` has `mcp__styxy__*` permissions
- Restart Claude Code after config changes

**"Port allocation failed"**
```bash
styxy cleanup --force  # Clean stale allocations
styxy logs --level error  # Check for daemon errors
```

## 🔮 Future Enhancements

- [ ] Port reservation system
- [ ] Integration with Docker port mapping
- [ ] Automatic service discovery
- [ ] Port usage analytics dashboard
- [ ] Integration with popular dev tools (Vite, Webpack, etc.)

---

**Made for the styxy ecosystem** - Invisible, intelligent port management for Claude Code! 🎯