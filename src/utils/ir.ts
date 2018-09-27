import { TextDocument, Range, TextLine, workspace } from "vscode";
import * as Constants from "../common/constants";
import * as path from "path";

export enum NodeType {
    Include = "Include",
    FileVariable = "FileVariable",
    Document = "Document"
}

export interface IncludeNode {
    type: NodeType.Include,
    sourceDocument: DocumentNode,
    range: Range,
    relativePath: string,
    includedDocument: DocumentNode,
}

export interface FileVariableNode {
    type: NodeType.FileVariable,
    sourceDocument: DocumentNode,
    range: Range,
    key: string,
    value: string,
}

export interface DocumentNode {
    type: NodeType.Document,
    textDocument: TextDocument,
    children: Node[]
}

export type Node =
    | IncludeNode
    | FileVariableNode
    | DocumentNode
    ;

const IncludeRegex = /^@@include\s+(.+)\s*$/;

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
    }

    private getCurrentLine(): TextLine {
        return this.document.lineAt(this.currentLine);
    }

    async parse(): Promise<DocumentNode> {
        console.log("Parsing document " + this.document.uri.toString());
        while (this.currentLine < this.document.lineCount)
        {
            let node = await this.tryParseNode();
            if (node != undefined) {
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
        let documentUri = this.document.uri;
        let documentDirPath = path.dirname(documentUri.fsPath);
        let includePath = path.resolve(documentDirPath, userIncludePath);

        console.log("Loading " + includePath);
        let includeDocument = await workspace.openTextDocument(includePath);
        let documentNode = await parse(includeDocument);

        this.currentLine++;
        
        return {
            type: NodeType.Include,
            sourceDocument: this.documentNode,
            includedDocument: documentNode,
            range: line.range,
            relativePath: userIncludePath,
        };
    }

    private async tryParseFileVariableNode(): Promise<FileVariableNode | undefined> {
        let line = this.getCurrentLine();
        let match = line.text.match(Constants.FileVariableDefinitionRegex);
        if (match == null) {
            console.log("nope");
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
}

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