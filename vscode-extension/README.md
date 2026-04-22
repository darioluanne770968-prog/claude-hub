# Claude Hub VS Code Extension

View and manage Claude Code sessions directly in VS Code.

## Features

- 📋 **Session Browser**: Browse all your Claude Code sessions organized by project
- ⭐ **Favorites**: Quick access to starred sessions
- 👁️ **Session Preview**: View session content directly in VS Code
- 🔗 **Quick Actions**: Open in browser, copy session ID, toggle favorite
- 🔍 **Search**: Find sessions quickly

## Requirements

- Claude Hub web app running locally (default: http://localhost:3000)
- Node.js 18+

## Installation

### From Source

1. Clone or navigate to the `vscode-extension` directory
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 in VS Code to launch the extension in development mode

### Package Installation

```bash
cd vscode-extension
npm install
npm run package
# Install the generated .vsix file
code --install-extension claude-hub-vscode-0.1.0.vsix
```

## Configuration

Open VS Code Settings and search for "Claude Hub":

- `claudeHub.serverUrl`: URL of your Claude Hub server (default: `http://localhost:3000`)
- `claudeHub.showMessageCount`: Show message count in session list (default: `true`)

## Usage

1. Start your Claude Hub web app: `npm run dev`
2. Open VS Code and look for the Claude Hub icon in the Activity Bar
3. Browse your sessions by project
4. Click a session to preview it
5. Right-click for more options (open in browser, copy ID, favorite)

## Commands

- `Claude Hub: Refresh Sessions` - Refresh the session list
- `Claude Hub: Open Session` - Open a session in the preview panel
- `Claude Hub: Open in Browser` - Open session in Claude Hub web app
- `Claude Hub: Copy Session ID` - Copy session ID to clipboard
- `Claude Hub: Toggle Favorite` - Star/unstar a session

## Keyboard Shortcuts

You can add custom keyboard shortcuts in VS Code:

```json
{
  "key": "ctrl+shift+c",
  "command": "claudeHub.refreshSessions"
}
```

## Development

```bash
# Install dependencies
npm install

# Watch mode
npm run watch

# Compile
npm run compile

# Package
npm run package
```

## License

MIT
