'use strict';

import { TextDocument, Range, workspace } from 'vscode';
import * as Constants from "../../common/constants";
import { ResolveErrorMessage } from '../../models/httpVariableResolveResult';
import { VariableType } from '../../models/variableType';
import { calculateMD5Hash } from '../misc';
import { HttpVariableProvider, HttpVariableValue } from './httpVariableProvider';
import * as Ast from "../ast";

export class FileVariableProvider implements HttpVariableProvider {
    private static _instance: FileVariableProvider;

    public static get Instance(): FileVariableProvider {
        if (!FileVariableProvider._instance) {
            FileVariableProvider._instance = new FileVariableProvider();
        }

        return FileVariableProvider._instance;
    }

    private readonly escapee: Map<string, string> = new Map<string, string>([
        ['n', '\n'],
        ['r', '\r'],
        ['t', '\t']
    ]);

    private constructor() {
    }

    public readonly type: VariableType = VariableType.File;

    public async has(document: TextDocument, name: string): Promise<boolean> {
        const variables = await this.getFileVariables(document);
        return variables.some(v => v.name === name);
    }

    public async get(document: TextDocument, name: string): Promise<HttpVariableValue> {
        const variables = await this.getFileVariables(document);
        const variable = variables.find(v => v.name === name);
        if (!variable) {
            return { name, error: ResolveErrorMessage.FileVariableNotExist };
        } else {
            return variable;
        }
    }

    public getAll(document: TextDocument): Promise<HttpVariableValue[]> {
        return this.getFileVariables(document);
    }

    private async appendVariablesFromDocument(document: TextDocument, variables: Map<string, HttpVariableValue>) {
        try {
            var ast = Ast.parse(document);
        }
        catch(ex)
        {
            debugger;
        }
        for (let node of ast.children) {
            switch(node.type) {
                case Ast.NodeType.Include: {
                    let includeDocument = await workspace.openTextDocument(node.path.absolutePath);
                    await this.appendVariablesFromDocument(includeDocument, variables);
                    break;
                }
                case Ast.NodeType.FileVariable: {
                    variables.set(node.key, { name: node.key, value: node.value });
                    break;
                }
            }
        }
    }

    private async getFileVariables(document: TextDocument): Promise<HttpVariableValue[]> {
        let variables = new Map<string, HttpVariableValue>();
        await this.appendVariablesFromDocument(document, variables);
        let values = [...variables.values()];
        return values;
    }
}