import { TextDocument, Range, TextLine, workspace } from "vscode";
import * as Constants from "../common/constants";
import * as path from "path";
import { HttpRequest } from "../models/httpRequest";
import { EOL } from "os";
import { RequestParserFactory } from "../models/requestParserFactory";
import { Selector } from "./selector";

export enum NodeType {
    Include = "Include",
    FileVariable = "FileVariable",
    Document = "Document",
    Request = "Request",
}

export interface IncludeNode {
    type: NodeType.Include,
    sourceDocument: DocumentNode
    range: Range
    relativePath: string
    absolutePath: string
}

export interface FileVariableNode {
    type: NodeType.FileVariable
    sourceDocument: DocumentNode
    range: Range
    key: string
    value: string
}

export interface DocumentNode {
    type: NodeType.Document
    textDocument: TextDocument
    children: Node[]
}

export interface RequestNode {
    type: NodeType.Request
    textDocument: TextDocument
    range: Range,
    request: HttpRequest
}

export type Node =
    | IncludeNode
    | FileVariableNode
    | DocumentNode
    | RequestNode

const IncludeRegex = /^@@include\s+(.+)\s*$/;

const requestParserFactory = new RequestParserFactory();

class DocumentParser {
    private currentLine: number = 0;
    private document: TextDocument;
    private documentNode: DocumentNode;

    constructor(document: TextDocument) {
        this.document = document;
        this.documentNode = {
            type: NodeType.Document,
            children: [],
            textDocument: document,
        };

        this.tryParseNode = this.tryParseNode.bind(this);
        this.tryParseIncludeNode = this.tryParseIncludeNode.bind(this);
        this.tryParseFileVariableNode = this.tryParseFileVariableNode.bind(this);
        this.tryParseRequestNode = this.tryParseRequestNode.bind(this);
    }

    private getCurrentLine(): TextLine {
        return this.document.lineAt(this.currentLine);
    }

    private get hasReachedEnd() {
        return this.currentLine >= this.document.lineCount;
    }

    async parse(): Promise<DocumentNode> {
        while (!this.hasReachedEnd)
        {
            // Skip empty lines
            while(this.getCurrentLine().isEmptyOrWhitespace && !this.hasReachedEnd)
            {
                this.currentLine++;
            }

            let node = await this.tryParseNode();
            if (node != undefined)
            {
                this.documentNode.children.push(node);
            }
            else
            {
                this.currentLine++;
            }
        }

        return this.documentNode;
    }

    private tryParseNode(): Promise<Node | undefined> {
        return tryMany<Node | undefined>(
            this.tryParseIncludeNode,
            this.tryParseFileVariableNode,
            this.tryParseRequestNode
        );
    }

    private async tryParseIncludeNode(): Promise<IncludeNode | undefined> {
        let line = this.getCurrentLine();
        let match = line.text.match(IncludeRegex);
        if (match == null)
        {
            return undefined;
        }
        
        let userIncludePath = match[1];
        let absolutePath = path.resolve(path.dirname(this.document.fileName), userIncludePath);

        this.currentLine++;
        
        return {
            type: NodeType.Include,
            sourceDocument: this.documentNode,
            range: line.range,
            relativePath: userIncludePath,
            absolutePath,
        };
    }

    private async tryParseFileVariableNode(): Promise<FileVariableNode | undefined> {
        let line = this.getCurrentLine();
        let match = line.text.match(Constants.FileVariableDefinitionRegex);
        if (match == null) {
            return undefined;
        }

        let [, key, value] = match;

        this.currentLine++;

        return {
            type: NodeType.FileVariable,
            key, value,
            range: line.range,
            sourceDocument: this.documentNode,
        };
    }

    private async tryParseRequestNode(): Promise<RequestNode | undefined> {
        let firstLine = this.getCurrentLine();
        if (firstLine.isEmptyOrWhitespace)
            return undefined;
        
        let allLines: TextLine[] = [];
        let offset = 0;
        while(this.currentLine + offset < this.document.lineCount)
        {
            let line = this.document.lineAt(this.currentLine + offset);
            
            if (RequestEndRegex.test(line.text))
            {
                break;
            }
            
            allLines.push(line);
            offset++;
        }

        this.currentLine += offset;

        let nonCommentLines = allLines.filter(line => !Selector.isCommentLine(line.text));
        if (nonCommentLines.length == 0)
            return undefined;

        let range = nonCommentLines[0].range;
        if (nonCommentLines.length > 1)
        {
            let lastLine = nonCommentLines[nonCommentLines.length - 1];
            range = range.union(lastLine.range);
        }

        let requestText = nonCommentLines.map(line => line.text).join(EOL);

        if (requestText.trim().length == 0)
            return undefined;

        let parser = requestParserFactory.createRequestParser(requestText);
        let request = parser.parseHttpRequest(requestText, this.document.fileName);

        return {
            type: NodeType.Request,
            textDocument: this.document,
            range,
            request: null as any,
        }
    }
}

const RequestEndRegex = /^#{3,}|^@/;

type TryFunc<T> = () => Promise<T>;

async function tryMany<T>(...funcs: Array<TryFunc<T | undefined>>): Promise<T | undefined>
{
    for (let func of funcs)
    {
        let result = await func();
        if (result != undefined)
            return result;
    }
    return undefined;
}

export function parse(document: TextDocument) : Promise<DocumentNode> {
    return new DocumentParser(document).parse();
}