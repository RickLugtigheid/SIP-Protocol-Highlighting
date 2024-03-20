'use strict';

import * as vscode from 'vscode';
import SIPConfigDocumentSymbolProvider from './features/documentSymbolProvider';
import SIPDiagramViewPanel, { getWebviewOptions } from './features/sipDiagramView';

export function activate(context: vscode.ExtensionContext) {
    
    // Register providers
    //
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({scheme: "file", language: "sip"}, new SIPConfigDocumentSymbolProvider()));

	// Register Commands
	//
    context.subscriptions.push(
		vscode.commands.registerCommand('sipDiagram.start', () => {
			// Check if there is an active editor
			//
			if (!vscode.window.activeTextEditor) {
				return;
			}
			let { document } = vscode.window.activeTextEditor;
			// SIP diagrams can only open for SIP language files
			//
			if (document.languageId !== 'sip') {
				return;
			}

			SIPDiagramViewPanel.createOrShow(context.extensionUri, document);
		})
	);

	// context.subscriptions.push(
	// 	vscode.commands.registerCommand('catCoding.doRefactor', () => {
	// 		if (SIPDiagramViewPanel.currentPanel) {
	// 			SIPDiagramViewPanel.currentPanel.doRefactor();
	// 		}
	// 	})
	// );

	if (vscode.window.registerWebviewPanelSerializer) {
		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer(SIPDiagramViewPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log(`Got state: ${state}`);

				// Check if there is an active editor
				//
				if (!vscode.window.activeTextEditor) {
					return;
				}
				let { document } = vscode.window.activeTextEditor;

				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				SIPDiagramViewPanel.revive(webviewPanel, context.extensionUri, document);
			}
		});
	}
}
