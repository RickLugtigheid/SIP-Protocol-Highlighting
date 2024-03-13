'use strict';

import * as vscode from 'vscode';
import SIPConfigDocumentSymbolProvider from './features/documentSymbolProvider';

export function activate(context: vscode.ExtensionContext) {
    
    // Add providers
    //
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({scheme: "file", language: "sip"}, new SIPConfigDocumentSymbolProvider()));
}
