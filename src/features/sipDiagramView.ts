import * as vscode from 'vscode';
import SIPParser, { SIPMessage } from '../sipParser';

const cats = {
	'Coding Cat': 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
	'Compiling Cat': 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
	'Testing Cat': 'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif'
};


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

		var generator = new Promise<void>(resolve => {

		});

		// First read all request and response lines of our document
		//
		let parser = new SIPParser();
		parser.parse(this._document);
		console.log('parser.messages: ', parser.messages);

		// Then link the requests to the appropriate responses
		//
		const messageGroups: {[key: string]: SIPMessageGroup} = {};
		parser.messages.forEach(message => {

			if (message.headers['call-id'])
			{
				let callID = message.headers['call-id'];
				if (messageGroups[callID])
				{
					messageGroups[callID].addMessage(message);
				}
				else
				{
					messageGroups[callID] = new SIPMessageGroup(callID, message);
				}
			}
		});
		console.log('messageGroups: ', messageGroups);

		// And at last generate the mermaid code for the diagram
		//
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

class MermaidSequenceDiagram
{
	public participants:string[];
	public messages:string[];

	public constructor() {
		this.participants = [];
		this.messages = []
	}

	public addParticipant(participant:string)
	{
		this.participants.push(participant);
	}
	public addMessage(from: string, to: string, message: string, isResponse: boolean)
	{
		let arrow = isResponse ? '-->>' : '->>';
		this.messages.push(`${from}${arrow}${to}: ${message}`);
	}
	/**
	 * Builds the diagram code needed to render this diagram with mermaid.
	 */
	public build()
	{
		let code = 'sequenceDiagram';
		this.participants.forEach(participant => {
			code += '\nparticipant ' + participant;
		});
		this.messages.forEach(message => {
			code += '\n' + message;
		});
		return code;
	}
}
enum SIPMessageKind
{
	Default,
	ServerToClient,
	ClientToServer
}
class SIPMessageGroup
{
	public callID:string;
	public messages:SIPMessage[];
	public diagram: MermaidSequenceDiagram;
	public type: SIPMessageKind;

	private _from: string = 'Unknown';
	private _via: string = 'PBX';
	private _to: string = 'Unknown';

	private _justAskedForAuth: boolean = false;
	private _whoWasAskedForAuth: string = 'Unknown';

	public constructor(callID:string, firstMessage:SIPMessage)
	{
		this.callID = callID;
		this.messages = [];
		this.diagram = new MermaidSequenceDiagram();
		this.type = SIPMessageKind.Default;

		//
		if (firstMessage.requestLine.startsWith('OPTIONS')
			|| firstMessage.requestLine.startsWith('REGISTER')
		)
		{
			this.type = firstMessage.requestLine.startsWith('OPTIONS') ? SIPMessageKind.ServerToClient : SIPMessageKind.ClientToServer;
			this._to = SIPParser.parseURI(firstMessage.headers['to'])?.endpoint ?? 'unknown';
			this._from = 'PBX';
			this.diagram.addParticipant(this._to);
			this.diagram.addParticipant(this._from);
		}
		else
		{
			this._from = SIPParser.parseURI(firstMessage.headers['from'])?.endpoint ?? 'unknown';
			this._via = 'PBX';
			this._to = SIPParser.parseURI(firstMessage.headers['to'])?.endpoint ?? 'unknown';
			this.diagram.addParticipant(this._from);
			this.diagram.addParticipant(this._via);
			this.diagram.addParticipant(this._to);
		}

		//
		this.addMessage(firstMessage);
	}

	public addMessage(message: SIPMessage)
	{
		this.messages.push(message);

		//
		// Add our message to our diagram
		//

		// Handle options message
		//
		if (this.type === SIPMessageKind.ServerToClient)
		{
			if (message.isResponse)
			{
				this.diagram.addMessage(this._to, this._from, message.humanize(), message.isResponse);
			}
			else
			{
				this.diagram.addMessage(this._from, this._to, message.humanize(), message.isResponse);
			}
			return;
		}

		// Handle register message
		//
		if (this.type === SIPMessageKind.ClientToServer)
		{
			if (message.isResponse)
			{
				this.diagram.addMessage(this._from, this._to, message.humanize(), message.isResponse);
			}
			else
			{
				this.diagram.addMessage(this._to, this._from, message.humanize(), message.isResponse);
			}
			return;
		}

		// Handle default message
		//
		if (message.isResponse)
		{
			this.diagram.addMessage(this._to, this._via, message.humanize(), message.isResponse);

			// Check if the message will be forwarded by this._via (PBX)
			//
			if (this._shouldForwardMessage(message, this._to))
			{
				this.diagram.addMessage(this._via, this._from, message.humanize(), message.isResponse);
			}
		}
		else
		{
			if (!this._justAskedForAuth && this._from !== this._whoWasAskedForAuth)
			{
				this.diagram.addMessage(this._from, this._via, message.humanize(), message.isResponse);
			}

			// Check if the message will be forwarded by this._via (PBX)
			//
			if (this._shouldForwardMessage(message, this._from))
			{
				this.diagram.addMessage(this._via, this._to, message.humanize(), message.isResponse);	
			}
		}
	}

	private _shouldForwardMessage(message: SIPMessage, invoker: string)
	{
		//
		// TODO: Find a better solution.
		//

		// The reponse to a require auth server response
		// should not be forwarded.
		//
		if (this._justAskedForAuth && invoker !== this._whoWasAskedForAuth && !message.isResponse)
		{
			console.warn(invoker, 'just confirmed (message: ', message, ')');
			this._justAskedForAuth = false;
			return true;
		}

		if (message.isResponse)
		{
			let statusCode = message.requestLine.split(' ')[1];
			switch (statusCode)
			{
				case '401': // Unauthorized
				case '407': // Requires Auth
					console.warn(invoker, 'was just asked for authentication (message: ', message, ')');
					this._justAskedForAuth = true;
					this._whoWasAskedForAuth = invoker;
				return false;
			}
		}
		return true;
	}
}