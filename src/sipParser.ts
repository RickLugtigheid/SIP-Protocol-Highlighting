import * as vscode from 'vscode';

export default class SIPParser
{
    public messages: SIPMessage[];

    public constructor() {
        this.messages = [];
    }

    /**
     * Parses the SIP protocol for the given source document
     * @param source 
     * @returns 
     */
    public parse(source: vscode.TextDocument) {

        let messages: SIPMessage[] = [];

		for (let i = 0; i < source.lineCount; i++) 
        {
			const line = source.lineAt(i);

			// Match request/response line
			//
			if (/[A-z]\s.*\sSIP\/.*/.test(line.text)    // Request line
                || line.text.startsWith('SIP/')         // Response line
            )
			{
				let message = new SIPMessage(line.text);
				// Parse our headers
                message.headers = this._parseMessageHeaders(i, source);
                messages.push(message);
			}
		}
        this.messages = messages;
    }

    private _parseMessageHeaders(ptr: number, source: vscode.TextDocument)
    {
        const headers: {[key: string]: string} = {};
        // While we match the next line
        //
        let line;
        while (source.lineCount > (ptr + 1))
        {
            line = source.lineAt(ptr + 1)

            // Check if the next line is a header
            //
            if (!/^[A-z\\6-]+:/.test(line.text))
            {
                // Stop parsing headers
                break;
            }

            ptr++;
            let separatorIndex = line.text.indexOf(':');
            let name = line.text.slice(0, separatorIndex);
            let value = line.text.slice(separatorIndex + 2, line.text.length);
            headers[name.toLocaleLowerCase()] = value;
        }
        return headers;
    }

    /**
     * Parses the given SIP URI to an object
     * @param sipURI 
     * @returns 
     */
    public static parseURI(sipURI: string)
    {
        let match = sipURI.match(/(?<scheme>sips?):(?<endpoint>[^@\n<>]+)(?:@[^<>\[\]\{\}\(\)\s]+)?/);
        if (match?.[0] == null)
        {
            return null;
        }
        let scheme   = match?.groups?.scheme ?? 'anonymous';
        let endpoint = match?.groups?.endpoint ?? 'anonymous';
        return new SIPURI(scheme, endpoint);
    }
}

export class SIPMessage
{
    public readonly isResponse: boolean;
	public readonly requestLine: string;
	public headers: {[key: string]: string}

	public constructor(requestLine: string)
    {
		this.requestLine = requestLine;
        this.isResponse = requestLine.startsWith('SIP/');
		this.headers = {};
	}

    public humanize()
    {
        if (this.isResponse)
        {
            return this.requestLine.slice(this.requestLine.indexOf(' '), this.requestLine.length);
        }
        return this.requestLine.split(' ')[0];
    }
}

export class SIPURI
{
    public scheme: string;
    public endpoint: string;

    public constructor (scheme: string, endpoint: string)
    {
        this.scheme = scheme;
        this.endpoint = endpoint;
    }
}