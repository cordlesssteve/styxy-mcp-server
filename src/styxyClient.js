import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import net from 'net';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export class StyxyClient {
  constructor() {
    this.daemonSocket = null;
    this.config = null;
  }

  async getConfig() {
    if (!this.config) {
      try {
        // Try to get config from styxy command
        const { stdout } = await execAsync('styxy config show --json');
        this.config = JSON.parse(stdout);
      } catch (error) {
        // Fallback to default config locations
        this.config = await this.loadDefaultConfig();
      }
    }
    return this.config;
  }

  async loadDefaultConfig() {
    const possiblePaths = [
      path.join(os.homedir(), '.styxy', 'config.json'),
      path.join(os.homedir(), '.config', 'styxy', 'config.json'),
      '/etc/styxy/config.json'
    ];

    for (const configPath of possiblePaths) {
      try {
        const content = await fs.readFile(configPath, 'utf8');
        return { ...JSON.parse(content), config_path: configPath };
      } catch (error) {
        // Continue to next path
      }
    }

    // Return minimal default config
    return {
      daemon: {
        socket_path: path.join(os.homedir(), '.styxy', 'daemon.sock'),
        port_range: { start: 3000, end: 9999 }
      },
      config_path: 'not found'
    };
  }

  async connectToDaemon() {
    if (this.daemonSocket?.readyState === 'open') {
      return this.daemonSocket;
    }

    const config = await this.getConfig();
    const socketPath = config.daemon?.socket_path || path.join(os.homedir(), '.styxy', 'daemon.sock');

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);

      socket.on('connect', () => {
        this.daemonSocket = socket;
        resolve(socket);
      });

      socket.on('error', (error) => {
        // If socket connection fails, try CLI fallback
        reject(new Error(`Daemon not reachable: ${error.message}. Try 'styxy daemon start'`));
      });

      socket.setTimeout(5000);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Daemon connection timeout. Check if styxy daemon is running.'));
      });
    });
  }

  async sendDaemonCommand(command) {
    try {
      const socket = await this.connectToDaemon();

      return new Promise((resolve, reject) => {
        let response = '';

        socket.write(JSON.stringify(command) + '\n');

        socket.on('data', (data) => {
          response += data.toString();
          try {
            const result = JSON.parse(response);
            resolve(result);
          } catch (e) {
            // Response not complete yet, continue
          }
        });

        socket.on('error', reject);

        setTimeout(() => {
          reject(new Error('Command timeout'));
        }, 10000);
      });
    } catch (error) {
      // Fallback to CLI commands
      return this.fallbackToCliCommand(command);
    }
  }

  async fallbackToCliCommand(command) {
    const { type } = command;

    switch (type) {
      case 'allocate':
        return this.cliAllocatePort(command);
      case 'status':
        return this.cliGetStatus();
      case 'cleanup':
        return this.cliCleanup(command);
      default:
        throw new Error(`CLI fallback not implemented for command type: ${type}`);
    }
  }

  async cliAllocatePort(command) {
    try {
      const { context, preferences } = command;
      const args = [
        'allocate',
        '--service-type', context.serviceType,
        '--project', context.projectName
      ];

      if (preferences.port) {
        args.push('--preferred-port', preferences.port.toString());
      }

      if (preferences.duration) {
        args.push('--duration', preferences.duration);
      }

      const { stdout } = await execAsync(`styxy ${args.join(' ')}`);

      // Parse styxy CLI output
      const lines = stdout.trim().split('\n');
      const portLine = lines.find(line => line.includes('Port:'));
      const port = portLine ? parseInt(portLine.match(/\d+/)[0]) : null;

      if (!port) {
        throw new Error('Failed to parse allocated port from styxy output');
      }

      return {
        allocated_port: port,
        service_url: `http://localhost:${port}`,
        cleanup_command: `styxy release ${port}`,
        duration: preferences.duration || 'session',
        expires_with_session: preferences.duration === 'session',
        usage_example: this.generateUsageExamplesCli(context.serviceType, port),
        raw_output: stdout
      };
    } catch (error) {
      throw new Error(`CLI allocation failed: ${error.message}`);
    }
  }

  async cliGetStatus() {
    try {
      const { stdout } = await execAsync('styxy status --json');
      return JSON.parse(stdout);
    } catch (error) {
      // If JSON flag not supported, parse text output
      try {
        const { stdout } = await execAsync('styxy status');
        return this.parseStatusOutput(stdout);
      } catch (fallbackError) {
        return {
          daemon_running: false,
          error: `Status check failed: ${fallbackError.message}`,
          active_ports: [],
          recent_errors: [`CLI error: ${fallbackError.message}`]
        };
      }
    }
  }

  parseStatusOutput(output) {
    const lines = output.split('\n');

    return {
      daemon_running: !output.includes('not running') && !output.includes('failed'),
      pid: this.extractValue(lines, 'PID:'),
      uptime: this.extractValue(lines, 'Uptime:'),
      active_ports: this.extractPorts(lines),
      config_path: this.extractValue(lines, 'Config:'),
      log_path: this.extractValue(lines, 'Logs:'),
      raw_output: output
    };
  }

  extractValue(lines, prefix) {
    const line = lines.find(l => l.includes(prefix));
    return line ? line.split(prefix)[1]?.trim() : null;
  }

  extractPorts(lines) {
    const ports = [];
    for (const line of lines) {
      const match = line.match(/(\d+)\s*-\s*(.+)/);
      if (match) {
        ports.push({
          port: parseInt(match[1]),
          description: match[2].trim()
        });
      }
    }
    return ports;
  }

  async cliCleanup(command) {
    try {
      const args = ['cleanup'];

      if (command.force) {
        args.push('--force');
      }

      if (command.port) {
        args.push('--port', command.port.toString());
      }

      const { stdout } = await execAsync(`styxy ${args.join(' ')}`);

      return {
        released_ports: this.extractReleasedPorts(stdout),
        raw_output: stdout
      };
    } catch (error) {
      return {
        released_ports: [],
        errors: [error.message],
        raw_output: error.stdout || ''
      };
    }
  }

  extractReleasedPorts(output) {
    const matches = output.match(/Released port (\d+)/g) || [];
    return matches.map(match => parseInt(match.match(/\d+/)[0]));
  }

  generateUsageExamplesCli(serviceType, port) {
    const examples = {
      web: `npm run dev -- --port ${port}`,
      api: `PORT=${port} npm start`,
      storybook: `npm run storybook -- --port ${port}`,
      database: `# Configure your database to use port ${port}`,
      testing: `npm test -- --port ${port}`
    };

    return examples[serviceType] || `# Use port ${port} for your ${serviceType} service`;
  }

  // Main API methods
  async allocatePort(options) {
    const command = {
      type: 'allocate',
      context: {
        serviceType: options.serviceType,
        projectName: options.projectName,
        workingDir: process.cwd(),
        claudeSessionId: options.claudeSessionId
      },
      preferences: {
        port: options.preferredPort,
        duration: options.duration || 'session'
      },
      metadata: {
        serviceName: options.serviceName,
        timestamp: new Date().toISOString()
      }
    };

    return await this.sendDaemonCommand(command);
  }

  async getStatus(options = {}) {
    const command = {
      type: 'status',
      options: {
        include_ports: options.include_ports !== false,
        include_recent_errors: options.include_recent_errors !== false
      }
    };

    return await this.sendDaemonCommand(command);
  }

  async getLogs(options = {}) {
    const command = {
      type: 'logs',
      options: {
        level: options.level || 'info',
        time_range: options.time_range || '1h',
        filter: options.filter,
        limit: options.limit || 50
      }
    };

    try {
      return await this.sendDaemonCommand(command);
    } catch (error) {
      // Fallback to reading log files directly
      return this.readLogFiles(options);
    }
  }

  async readLogFiles(options) {
    try {
      const config = await this.getConfig();
      const logPath = config.daemon?.log_path || path.join(os.homedir(), '.styxy', 'daemon.log');

      const content = await fs.readFile(logPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);

      return {
        entries: lines.slice(-options.limit || -50),
        summary: `Read ${lines.length} log entries from ${logPath}`
      };
    } catch (error) {
      return {
        entries: [],
        summary: `Could not read log files: ${error.message}`
      };
    }
  }

  async getConfig(options = {}) {
    const config = await this.getConfig();

    if (options.validate) {
      const validation = await this.validateConfig(config);
      return {
        ...config,
        validation_errors: validation.errors,
        is_valid: validation.isValid
      };
    }

    if (!options.show_sensitive) {
      // Remove sensitive data
      const sanitized = { ...config };
      delete sanitized.secrets;
      delete sanitized.tokens;
      return sanitized;
    }

    return config;
  }

  async validateConfig(config) {
    const errors = [];

    if (!config.daemon) {
      errors.push('Missing daemon configuration');
    } else {
      if (!config.daemon.socket_path) {
        errors.push('Missing daemon socket_path');
      }
      if (!config.daemon.port_range) {
        errors.push('Missing port_range configuration');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async cleanup(options = {}) {
    const command = {
      type: 'cleanup',
      force: options.force || false,
      port: options.port,
      session_id: process.env.CLAUDE_SESSION_ID
    };

    return await this.sendDaemonCommand(command);
  }

  async getMetrics(options = {}) {
    const command = {
      type: 'metrics',
      options: {
        time_range: options.time_range || '24h',
        include_patterns: options.include_patterns !== false
      }
    };

    try {
      return await this.sendDaemonCommand(command);
    } catch (error) {
      // Return basic metrics if daemon doesn't support it
      return {
        total_allocations: 0,
        active_allocations: 0,
        top_service_type: 'unknown',
        top_project: 'unknown',
        recommendations: [
          'Enable metrics collection in styxy daemon for detailed analytics'
        ]
      };
    }
  }
}