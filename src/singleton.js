#!/usr/bin/env node
/**
 * Singleton Lock Manager for Styxy MCP Server
 * Prevents multiple instances from running simultaneously
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SingletonLock {
  constructor(lockName = 'styxy-mcp-server') {
    this.lockName = lockName;
    this.lockDir = path.join(os.homedir(), '.styxy', 'locks');
    this.lockFile = path.join(this.lockDir, `${lockName}.lock`);
    this.acquired = false;
    this.pid = process.pid;
  }

  /**
   * Attempt to acquire the singleton lock
   * @returns {boolean} True if lock acquired, false if another instance is running
   */
  acquire() {
    try {
      // Ensure lock directory exists
      fs.mkdirSync(this.lockDir, { recursive: true });

      // Check if lock file exists
      if (fs.existsSync(this.lockFile)) {
        const lockData = this.readLockFile();
        
        if (lockData && this.isProcessRunning(lockData.pid)) {
          console.log(`[Singleton] Another styxy-mcp-server instance is running (PID: ${lockData.pid})`);
          return false;
        } else {
          console.log(`[Singleton] Stale lock file found, cleaning up...`);
          this.cleanup();
        }
      }

      // Create lock file
      const lockData = {
        pid: this.pid,
        started: new Date().toISOString(),
        hostname: os.hostname(),
        command: process.argv.join(' ')
      };

      fs.writeFileSync(this.lockFile, JSON.stringify(lockData, null, 2));
      this.acquired = true;
      
      // Setup cleanup on exit
      this.setupCleanupHandlers();
      
      console.log(`[Singleton] Lock acquired successfully (PID: ${this.pid})`);
      return true;

    } catch (error) {
      console.error(`[Singleton] Failed to acquire lock:`, error);
      return false;
    }
  }

  /**
   * Release the singleton lock
   */
  release() {
    if (!this.acquired) return;

    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
        console.log(`[Singleton] Lock released (PID: ${this.pid})`);
      }
      this.acquired = false;
    } catch (error) {
      console.error(`[Singleton] Failed to release lock:`, error);
    }
  }

  /**
   * Check if lock is currently held by this instance
   */
  isAcquired() {
    return this.acquired;
  }

  /**
   * Read and parse lock file
   */
  readLockFile() {
    try {
      const content = fs.readFileSync(this.lockFile, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Check if a process is still running
   */
  isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup stale lock files
   */
  cleanup() {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
      }
    } catch (error) {
      console.error(`[Singleton] Cleanup failed:`, error);
    }
  }

  /**
   * Setup process exit handlers to cleanup lock
   */
  setupCleanupHandlers() {
    const cleanup = () => {
      this.release();
    };

    // Handle normal exit
    process.on('exit', cleanup);
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n[Singleton] Received SIGINT, cleaning up...');
      cleanup();
      process.exit(0);
    });
    
    // Handle kill
    process.on('SIGTERM', () => {
      console.log('[Singleton] Received SIGTERM, cleaning up...');
      cleanup();
      process.exit(0);
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('[Singleton] Uncaught exception:', error);
      cleanup();
      process.exit(1);
    });
  }

  /**
   * Get information about current lock holder
   */
  getLockInfo() {
    if (!fs.existsSync(this.lockFile)) {
      return null;
    }
    
    return this.readLockFile();
  }
}