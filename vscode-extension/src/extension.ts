import * as vscode from 'vscode';

interface Session {
  id: string;
  projectName: string;
  summaries: string[];
  customName?: string;
  lastModified: string;
  messageCount: number;
  isFavorite?: boolean;
  tags?: string[];
}

interface Project {
  name: string;
  path: string;
  sessions: Session[];
}

class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly session: Session,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(
      session.customName || session.summaries[0] || `Session ${session.id.slice(0, 8)}`,
      collapsibleState
    );

    this.tooltip = `${session.projectName}\n${session.messageCount} messages\n${new Date(session.lastModified).toLocaleString()}`;
    this.description = `${session.messageCount} msgs`;
    this.contextValue = 'session';

    if (session.isFavorite) {
      this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
    } else {
      this.iconPath = new vscode.ThemeIcon('comment-discussion');
    }

    this.command = {
      command: 'claudeHub.openSession',
      title: 'Open Session',
      arguments: [session],
    };
  }
}

class ProjectTreeItem extends vscode.TreeItem {
  constructor(
    public readonly project: Project,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(project.name, collapsibleState);
    this.tooltip = project.path;
    this.description = `${project.sessions.length} sessions`;
    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'project';
  }
}

class SessionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private projects: Project[] = [];
  private favorites: string[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.refresh();
  }

  refresh(): void {
    this.fetchSessions().then(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  private async fetchSessions(): Promise<void> {
    const config = vscode.workspace.getConfiguration('claudeHub');
    const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');

    try {
      const response = await fetch(`${serverUrl}/api/sessions`);
      if (response.ok) {
        const data = await response.json();
        this.projects = data.projects || data;
        this.favorites = data.favorites || [];
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to fetch sessions: ${error}`);
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (!element) {
      // Root level - show projects
      return Promise.resolve(
        this.projects.map(
          (project) => new ProjectTreeItem(project, vscode.TreeItemCollapsibleState.Collapsed)
        )
      );
    }

    if (element instanceof ProjectTreeItem) {
      // Project level - show sessions
      return Promise.resolve(
        element.project.sessions.map(
          (session) => new SessionTreeItem(session, vscode.TreeItemCollapsibleState.None)
        )
      );
    }

    return Promise.resolve([]);
  }
}

class FavoritesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private favorites: Session[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.refresh();
  }

  refresh(): void {
    this.fetchFavorites().then(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  private async fetchFavorites(): Promise<void> {
    const config = vscode.workspace.getConfiguration('claudeHub');
    const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');

    try {
      const response = await fetch(`${serverUrl}/api/sessions`);
      if (response.ok) {
        const data = await response.json();
        const projects: Project[] = data.projects || data;
        const favoriteIds: string[] = data.favorites || [];

        this.favorites = [];
        for (const project of projects) {
          for (const session of project.sessions) {
            if (favoriteIds.includes(session.id) || session.isFavorite) {
              this.favorites.push(session);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch favorites:', error);
    }
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<vscode.TreeItem[]> {
    return Promise.resolve(
      this.favorites.map(
        (session) => new SessionTreeItem(session, vscode.TreeItemCollapsibleState.None)
      )
    );
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Hub extension is now active!');

  const sessionsProvider = new SessionsProvider(context);
  const favoritesProvider = new FavoritesProvider(context);

  vscode.window.registerTreeDataProvider('claudeHubSessions', sessionsProvider);
  vscode.window.registerTreeDataProvider('claudeHubFavorites', favoritesProvider);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeHub.refreshSessions', () => {
      sessionsProvider.refresh();
      favoritesProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeHub.openSession', async (session: Session) => {
      const panel = vscode.window.createWebviewPanel(
        'claudeHubSession',
        session.customName || session.summaries[0] || 'Claude Session',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
        }
      );

      const config = vscode.workspace.getConfiguration('claudeHub');
      const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');

      try {
        const response = await fetch(`${serverUrl}/api/sessions/${session.id}`);
        if (response.ok) {
          const data = await response.json();
          panel.webview.html = getSessionWebviewContent(data);
        }
      } catch (error) {
        panel.webview.html = `<html><body><h1>Error loading session</h1><p>${error}</p></body></html>`;
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeHub.openInBrowser', (item: SessionTreeItem) => {
      const config = vscode.workspace.getConfiguration('claudeHub');
      const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');
      vscode.env.openExternal(vscode.Uri.parse(`${serverUrl}/session/${item.session.id}`));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeHub.copySessionId', (item: SessionTreeItem) => {
      vscode.env.clipboard.writeText(item.session.id);
      vscode.window.showInformationMessage('Session ID copied to clipboard');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeHub.toggleFavorite', async (item: SessionTreeItem) => {
      const config = vscode.workspace.getConfiguration('claudeHub');
      const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');

      try {
        await fetch(`${serverUrl}/api/user-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'toggleFavorite',
            sessionId: item.session.id,
          }),
        });
        sessionsProvider.refresh();
        favoritesProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to toggle favorite: ${error}`);
      }
    })
  );
}

function getSessionWebviewContent(session: { messages: Array<{ type: string; role?: string; richContent?: Array<{ type: string; text?: string }> }> }): string {
  const messages = session.messages || [];

  let content = '';
  for (const msg of messages) {
    const isUser = msg.role === 'user' || msg.type === 'user';
    const text = msg.richContent?.find((c: { type: string; text?: string }) => c.type === 'text')?.text || '';

    if (text) {
      const bgColor = isUser ? '#fef3c7' : '#f3f4f6';
      const label = isUser ? '👤 You' : '🤖 Claude';
      content += `
        <div style="margin-bottom: 16px; padding: 12px; background: ${bgColor}; border-radius: 8px;">
          <div style="font-weight: bold; margin-bottom: 8px;">${label}</div>
          <div style="white-space: pre-wrap;">${escapeHtml(text)}</div>
        </div>
      `;
    }
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 16px;
          line-height: 1.5;
        }
      </style>
    </head>
    <body>
      ${content || '<p>No messages in this session</p>'}
    </body>
    </html>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function deactivate() {}
