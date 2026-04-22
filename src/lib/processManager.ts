// Simple in-memory process manager
// Tracks active Claude CLI processes by session ID

import { ChildProcess } from 'child_process';

interface ProcessInfo {
  pid: number;
  sessionId: string;
  startTime: Date;
  process: ChildProcess;
}

class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map();

  register(sessionId: string, process: ChildProcess): void {
    if (process.pid) {
      this.processes.set(sessionId, {
        pid: process.pid,
        sessionId,
        startTime: new Date(),
        process,
      });
      console.log(`Process registered: session=${sessionId}, pid=${process.pid}`);
    }
  }

  unregister(sessionId: string): void {
    const info = this.processes.get(sessionId);
    if (info) {
      console.log(`Process unregistered: session=${sessionId}, pid=${info.pid}`);
      this.processes.delete(sessionId);
    }
  }

  kill(sessionId: string): boolean {
    const info = this.processes.get(sessionId);
    if (info && info.process) {
      console.log(`Killing process: session=${sessionId}, pid=${info.pid}`);
      info.process.kill();
      this.processes.delete(sessionId);
      return true;
    }
    return false;
  }

  isActive(sessionId: string): boolean {
    return this.processes.has(sessionId);
  }

  getActiveProcesses(): Array<{ sessionId: string; pid: number; startTime: Date; duration: number }> {
    const now = new Date();
    return Array.from(this.processes.values()).map(info => ({
      sessionId: info.sessionId,
      pid: info.pid,
      startTime: info.startTime,
      duration: Math.floor((now.getTime() - info.startTime.getTime()) / 1000),
    }));
  }

  getCount(): number {
    return this.processes.size;
  }
}

// Singleton instance
export const processManager = new ProcessManager();
