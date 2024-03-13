import * as vscode from 'vscode';

export default class SIPConfigDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    private format(cmd: string):string{
        return cmd.substr(1).toLowerCase().replace(/^\w/, c => c.toUpperCase())
    }

    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> 
        {
        return new Promise((resolve, reject) => 
        {
            const symbols: vscode.DocumentSymbol[] = [];
            const nodes = [symbols]
            let inside_sipMessage = false;
            let inside_comment = false;
            let currentSIPMessage:vscode.DocumentSymbol = new vscode.DocumentSymbol('unknown', '', vscode.SymbolKind.Null, new vscode.Range(0, 0, 0, 0), new vscode.Range(0, 0, 0, 0));

            /**
             * Ends the parsing of the current SIP message.
             * @param endAtLine The end of message line
             */
            function endSIPMessage(endAtLine:vscode.TextLine)
            {
                // Set the range end to the end of the message
                //
                let newRange = new vscode.Range(currentSIPMessage.range.start, endAtLine.range.end);
                currentSIPMessage.range = newRange;
                currentSIPMessage.selectionRange = newRange;

                // Add our message to nodes
                nodes[nodes.length-1].push(currentSIPMessage);
                inside_sipMessage = false;
            }

            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);

                // Ignore commented lines
                //
                if (line.text.startsWith('--'))
                {
                    continue;
                }
                if (line.text.startsWith('<--'))
                {
                    if (line.text.endsWith('-->'))
                    {
                        continue;
                    }
                    inside_comment = true;
                    // TODO: Ignore until block comment end
                }
                if (inside_comment)
                {
                    if (line.text.includes('-->'))
                    {
                        inside_comment = false;
                    }
                    continue;
                }

                // Match request line
                //
                if (/[A-z]\s.*\sSIP\/.*/.test(line.text))
                {
                    // When we are already parsing a message
                    // stop paring and add the message to nodes.
                    //
                    if (inside_sipMessage)
                    {
                        endSIPMessage(line);
                    }
                    // Create our SIP message object
                    //
                    currentSIPMessage = new vscode.DocumentSymbol(
                        line.text,
                        'Request',
                        vscode.SymbolKind.Class,
                        line.range, line.range
                    );
                    inside_sipMessage = true;
                }
                // Match response line
                //
                else if (line.text.startsWith('SIP/'))
                {
                    // When we are already parsing a message
                    // stop paring and add the message to nodes.
                    //
                    if (inside_sipMessage)
                    {
                        endSIPMessage(line);
                    }
                    // Create our SIP message object
                    //
                    currentSIPMessage = new vscode.DocumentSymbol(
                        line.text,
                        'Response',
                        vscode.SymbolKind.Class,
                        line.range, line.range
                    );
                    inside_sipMessage = true;
                }
                // Match header
                //
                else if (/^[A-z\\6-]+:/.test(line.text))
                {

                    const symbol = new vscode.DocumentSymbol(
                        line.text.split(':')[0],
                        'Header',
                        vscode.SymbolKind.Property,
                        line.range, line.range
                    );
                    if (inside_sipMessage)
                    {
                        currentSIPMessage.children.push(symbol);
                    }
                }
            }
            // When we are parsing the last message
            // stop paring and add the message to nodes.
            //
            if (inside_sipMessage)
            {
                endSIPMessage(document.lineAt(document.lineCount - 1));
            }
            resolve(symbols);
        });
    }
}