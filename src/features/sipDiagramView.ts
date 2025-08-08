import * as vscode from 'vscode';
import SIPParser, { SIPMessage } from '../sipParser';

export function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,

		// And restrict the webview to only loading content from our extension's `media` directory.
		localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
	};
}

/**
 * Manages SIP diagram webview panels
 */
export default class SIPDiagramViewPanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static currentPanel: SIPDiagramViewPanel | undefined;

	public static readonly viewType = 'sipDiagramView';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _document: vscode.TextDocument;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (SIPDiagramViewPanel.currentPanel) {
			SIPDiagramViewPanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			SIPDiagramViewPanel.viewType,
			'SIP Diagram view',
			/*column || */vscode.ViewColumn.Beside,
			getWebviewOptions(extensionUri),
		);

		SIPDiagramViewPanel.currentPanel = new SIPDiagramViewPanel(panel, extensionUri, document);
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
		SIPDiagramViewPanel.currentPanel = new SIPDiagramViewPanel(panel, extensionUri, document);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._document = document;

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content based on view changes
		//
		this._panel.onDidChangeViewState(
			e => {
				this._update();
			},
			null,
			this._disposables
		);

		//
		vscode.window.onDidChangeActiveTextEditor(
			e => {
				// When switching to other SIP document
				// generate new diagrams for it.
				//
				if (e?.document.languageId === 'sip') {
					this._document = e?.document;
					this._update();
				}
			},
			null,
			this._disposables
		);

		// Handle messages from the webview
		//
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'alert':
						vscode.window.showErrorMessage(message.text);
						return;
				}
			},
			null,
			this._disposables
		);
	}

	public doRefactor() {
		// Send a message to the webview webview.
		// You can send any JSON serializable data.
		this._panel.webview.postMessage({ command: 'refactor' });
	}

	public dispose() {
		SIPDiagramViewPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Local path to main script run in the webview
		//const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'assets', 'js', 'main.js');

		// And the uri we use to load this script in the webview
		//const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

		// Local path to css styles
		const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');

		// Uri to load styles into webview
		const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();

		// Generate the mermaid code for our SIP document
		//
		const diagramCode = this._generateDiagramHtml();

		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Document</title>
			<link href="${stylesMainUri}" rel="stylesheet">
			<style>
			</style>
		</head>
		<body>
			<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js"></script>
			<script>
			let theme = 'base';
			if (document.body.classList.contains('vscode-dark')) {
				theme = 'dark';
			}
			mermaid.mermaidAPI.initialize({
				securityLevel: 'loose',
				theme: theme,
			});
			</script>

			<div class="container">
				`+ diagramCode +`
			</div>
		</body>
		</html>`;
	}

	private _generateDiagramHtml() {

		// First read all request and response lines of our document
		//
		let parser = new SIPParser();
		parser.parse(this._document);

		// Then link the requests to the appropriate responses
		//
		const messageGroups: {[key: string]: SIPMessageGroup} = {};
		parser.messages.forEach(message => {

			// Ensure we have a call-id
			//
			if (!message.headers['call-id']) {
				return;
			}

			// Handle dialogs
			//
			const callID = message.headers['call-id'];
			const fromTag = extractTag(message.headers['from']);
			const toTag = extractTag(message.headers['to']) || '';
			const dialogKey = `${callID}_${fromTag}_${toTag}`;

			if (messageGroups[dialogKey])
			{
				messageGroups[dialogKey].addMessage(message);
				return;
			}

			// Handle transactions
			//
			const cseq = message.headers['cseq'];
			const viaBranch = extractTopViaBranch(message.headers['via']);
			const transactionKey = `${callID}_${cseq}_${viaBranch}`;
			if (messageGroups[transactionKey])
			{
				messageGroups[transactionKey].addMessage(message);
				return;
			}

			// Handle stateless
			//
			const statelessKey = `${callID}_${fromTag}_${toTag}`;
			if (messageGroups[statelessKey])
			{
				messageGroups[statelessKey].addMessage(message);
				return;
			}

			// Else when not in a group create a new one
			//
			messageGroups[transactionKey] = new SIPMessageGroup(transactionKey, message);
		});

		// Generate the mermaid code for the diagram
		let html = '';
		for (let callID in messageGroups)
		{
			html += '<div class="mermaid">\n' + messageGroups[callID].diagram.build() + '\n</div><hr>';
		}
		return html;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

/**
 * Extracts the tag from the given header.
 * @param header The header to extract the tag from.
 * @returns The tag or an empty string if no tag was found.
 */
function extractTag(header: string): string {
	if (!header) return '';
	const match = header.match(/;tag=([^\s;>]+)/);
	return match ? match[1] : '';
}

/**
 * Extracts the branch from the given via header.
 * @param viaHeader 
 * @returns The branch or an empty string if no branch was found.
 */
function extractTopViaBranch(viaHeader: string): string {
	if (!viaHeader) return '';
	const match = viaHeader.match(/branch=([^;\s]+)/);
	return match ? match[1] : '';
}


enum SIPMessageKind {
  Default,
  ServerToClient,
  ClientToServer,
  ClientToTrunk
}

class MermaidSequenceDiagram {
  public participants: string[];
  public messages: string[];

  constructor() {
	this.participants = [];
	this.messages = [];
  }

  public addParticipant(participant: string) {
	if (!this.participants.includes(participant)) {
	  this.participants.push(participant);
	}
  }

  public addMessage(from: string, to: string, message: string, isResponse: boolean) {
	const arrow = isResponse ? '-->>' : '->>';
	this.messages.push(`${from}${arrow}${to}: ${message}`);
  }

  public build(): string {
	let code = 'sequenceDiagram';
	this.participants.forEach(participant => {
	  code += `\nparticipant ${participant}`;
	});
	this.messages.forEach(message => {
	  code += `\n${message}`;
	});
	return code;
  }
}

class SIPMessageGroup {
	public callID: string;
	public messages: SIPMessage[];
	public diagram: MermaidSequenceDiagram;
	public type: SIPMessageKind;

	private _from: string = 'Unknown';
	private _via: string = 'Unknown'; // Allow configurable server name
	private _to: string = 'Unknown';
	private _justAskedForAuth: boolean = false;
	private _whoWasAskedForAuth: string = 'Unknown';

	constructor(callID: string, firstMessage: SIPMessage, serverName: string = 'Server')
	{
		this.callID = callID;
		this.messages = [];
		this.diagram = new MermaidSequenceDiagram();
		this.type = SIPMessageKind.Default;
		this._via = serverName; // Use configurable server name

		// Determine message type and participants
		this._initializeParticipants(firstMessage);
		this.addMessage(firstMessage);
	}

	private _initializeParticipants(message: SIPMessage) {
		const fromUri = SIPParser.parseURI(message.headers['from']);
		const toUri = SIPParser.parseURI(message.headers['to']);

		if (message.requestLine.startsWith('OPTIONS')) {
			this.type = SIPMessageKind.ServerToClient;
			this._from = this._via;
			this._to = toUri?.endpoint ?? 'Unknown';
			this.diagram.addParticipant(this._from);
			this.diagram.addParticipant(this._to);
		} else if (message.requestLine.startsWith('REGISTER')) {
			this.type = SIPMessageKind.ClientToServer;
			this._from = fromUri?.endpoint ?? 'Unknown';
			this._to = this._via;
			this.diagram.addParticipant(this._from);
			this.diagram.addParticipant(this._to);
		} else if (this._isTrunkCall(message)) {
			this.type = SIPMessageKind.ClientToTrunk;
			this._from = fromUri?.endpoint ?? 'Unknown';
			this._to = toUri?.endpoint ?? 'Unknown';
			this.diagram.addParticipant(this._from);
			this.diagram.addParticipant(this._via);
			this.diagram.addParticipant(this._to);
		} else {
			this.type = SIPMessageKind.Default;
			this._from = fromUri?.endpoint ?? 'Unknown';
			this._to = toUri?.endpoint ?? 'Unknown';
			this.diagram.addParticipant(this._from);
			this.diagram.addParticipant(this._via);
			this.diagram.addParticipant(this._to);
		}
	}

	private _isTrunkCall(message: SIPMessage): boolean {
		// Implement logic to detect trunk calls based on message headers or configuration
		// Example: Check for specific header values or patterns indicating a trunk
		const toUri = SIPParser.parseURI(message.headers['to']);
		return toUri?.endpoint?.includes('trunk') || false; // Adjust based on your trunk detection logic
	}

	public addMessage(message: SIPMessage) {
		this.messages.push(message);

		switch (this.type) {
			case SIPMessageKind.ServerToClient:
				this._addServerToClientMessage(message);
				break;
			case SIPMessageKind.ClientToServer:
				this._addClientToServerMessage(message);
				break;
			case SIPMessageKind.ClientToTrunk:
			case SIPMessageKind.Default:
				this._addDefaultOrTrunkMessage(message);
				break;
		}
	}

	private _addServerToClientMessage(message: SIPMessage) {
		if (message.isResponse) {
			this.diagram.addMessage(this._to, this._from, message.humanize(), true);
		} else {
			this.diagram.addMessage(this._from, this._to, message.humanize(), false);
		}
	}

	private _addClientToServerMessage(message: SIPMessage) {
		if (message.isResponse) {
			this.diagram.addMessage(this._to, this._from, message.humanize(), true);
		} else {
			this.diagram.addMessage(this._from, this._to, message.humanize(), false);
		}
	}

	private _addDefaultOrTrunkMessage(message: SIPMessage) {
	if (message.isResponse) {
			if (this._shouldForwardMessage(message, this._to)) {
			this.diagram.addMessage(this._to, this._via, message.humanize(), true);
			this.diagram.addMessage(this._via, this._from, message.humanize(), true);
			} else {
			this.diagram.addMessage(this._to, this._via, message.humanize(), true);
			}
		} else {
			if (!this._justAskedForAuth || this._from === this._whoWasAskedForAuth) {
			this.diagram.addMessage(this._from, this._via, message.humanize(), false);
			}
			if (this._shouldForwardMessage(message, this._from)) {
			this.diagram.addMessage(this._via, this._to, message.humanize(), false);
			}
		}
	}

	private _shouldForwardMessage(message: SIPMessage, invoker: string): boolean {
		if (this._justAskedForAuth && invoker !== this._whoWasAskedForAuth && !message.isResponse) {
			this._justAskedForAuth = false;
			return true;
		}

		if (message.isResponse) {
			const statusCode = message.requestLine.split(' ')[1];
			switch (statusCode) {
			case '401': // Unauthorized
			case '407': // Proxy Authentication Required
				this._justAskedForAuth = true;
				this._whoWasAskedForAuth = invoker;
				return false;
			default:
				return true;
			}
		}
		return true;
	}
}