import fs from 'fs';
import path from 'path';
import os from 'os';

export interface RemoteHost {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  // Path to private key file (e.g., ~/.ssh/id_rsa)
  privateKeyPath: string;
  // Path to .claude directory on the remote host
  claudePath: string;
  // Whether this host is enabled
  enabled: boolean;
  // Operating system: 'macos' | 'linux' | 'windows'
  os: 'macos' | 'linux' | 'windows';
}

export interface RemoteHostsConfig {
  hosts: RemoteHost[];
}

const CONFIG_PATH = path.join(os.homedir(), '.claude-hub', 'remote-hosts.json');

// Ensure config directory exists
function ensureConfigDir() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Load remote hosts configuration
export function loadRemoteHosts(): RemoteHostsConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load remote hosts config:', error);
  }
  return { hosts: [] };
}

// Save remote hosts configuration
export function saveRemoteHosts(config: RemoteHostsConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Add a new remote host
export function addRemoteHost(host: Omit<RemoteHost, 'id'>): RemoteHost {
  const config = loadRemoteHosts();
  const newHost: RemoteHost = {
    ...host,
    id: `host-${Date.now()}`,
  };
  config.hosts.push(newHost);
  saveRemoteHosts(config);
  return newHost;
}

// Update a remote host
export function updateRemoteHost(id: string, updates: Partial<RemoteHost>): RemoteHost | null {
  const config = loadRemoteHosts();
  const index = config.hosts.findIndex(h => h.id === id);
  if (index === -1) return null;

  config.hosts[index] = { ...config.hosts[index], ...updates };
  saveRemoteHosts(config);
  return config.hosts[index];
}

// Delete a remote host
export function deleteRemoteHost(id: string): boolean {
  const config = loadRemoteHosts();
  const index = config.hosts.findIndex(h => h.id === id);
  if (index === -1) return false;

  config.hosts.splice(index, 1);
  saveRemoteHosts(config);
  return true;
}

// Get enabled remote hosts
export function getEnabledHosts(): RemoteHost[] {
  const config = loadRemoteHosts();
  return config.hosts.filter(h => h.enabled);
}

// Get a remote host by ID
export function getHostById(id: string): RemoteHost | null {
  const config = loadRemoteHosts();
  return config.hosts.find(h => h.id === id) || null;
}
