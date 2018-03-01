'use strict';

import { workspace, languages, Diagnostic, DiagnosticSeverity, DiagnosticCollection, TextDocument, Range, Position } from 'vscode';

import { OnRequestVariableEvent } from "./events/requestVariableEvent";
import { VariableProcessor } from "./variableProcessor";
import { RequestVariableCache } from "./requestVariableCache";
import { RequestVariableCacheKey } from './models/requestVariableCacheKey';
import { VariableType } from './models/variableType';
import { RequestVariableCacheValueProcessor } from "./requestVariableCacheValueProcessor";
import { ResolveState } from './models/requestVariableResolveResult';

export class VariableDiagnosticsProvider {
    private httpDiagnosticCollection: DiagnosticCollection;

    constructor() {
        this.httpDiagnosticCollection = languages.createDiagnosticCollection();

        this.checkVariablesInAllTextDocuments();

        OnRequestVariableEvent(() => this.checkVariablesInAllTextDocuments());
    }

    public dispose(): void {
        this.httpDiagnosticCollection.clear();
        this.httpDiagnosticCollection.dispose();
    }

    public deleteDocumentFromDiagnosticCollection(textDocument: TextDocument) {
        this.httpDiagnosticCollection.delete(textDocument.uri);
    }

    public checkVariablesInAllTextDocuments() {
        workspace.textDocuments.forEach(this.checkVariables, this);
    }

    public async checkVariables(document: TextDocument) {
        if (document.languageId !== 'http') {
            return;
        }

        const diagnostics: Diagnostic[] = [];

        const allAvailableVariables = await VariableProcessor.getAllVariablesDefinitions(document);
        const variableReferences = this.findVariableReferences(document);

        // Variable not found
        [...variableReferences.entries()]
            .filter(([name]) => !allAvailableVariables.has(name))
            .forEach(([, variables]) => {
                variables.forEach(v => {
                    diagnostics.push(
                        new Diagnostic(
                            new Range(new Position(v.lineNumber, v.startIndex), new Position(v.lineNumber, v.endIndex)),
                            `${v.variableName} is not found`,
                            DiagnosticSeverity.Error));
                });
            });

        // Request variable not active
        [...variableReferences.entries()]
            .filter(([name]) =>
                allAvailableVariables.has(name)
                && allAvailableVariables.get(name)[0] === VariableType.Request
                && !RequestVariableCache.has(new RequestVariableCacheKey(name, document.uri.toString())))
            .forEach(([, variables]) => {
                variables.forEach(v => {
                    diagnostics.push(
                        new Diagnostic(
                            new Range(new Position(v.lineNumber, v.startIndex), new Position(v.lineNumber, v.endIndex)),
                            `Request '${v.variableName}' has not been sent`,
                            DiagnosticSeverity.Error));
                });
            });

        // Request variable resolve with warning or error
        [...variableReferences.entries()]
            .filter(([name]) =>
                allAvailableVariables.has(name)
                && allAvailableVariables.get(name)[0] === VariableType.Request
                && RequestVariableCache.has(new RequestVariableCacheKey(name, document.uri.toString())))
            .forEach(([name, variables]) => {
                const value = RequestVariableCache.get(new RequestVariableCacheKey(name, document.uri.toString()));
                variables.forEach(v => {
                    const path = v.variableValue.replace(/^\{{2}\s*/, '').replace(/\s*\}{2}$/, '');
                    const result = RequestVariableCacheValueProcessor.resolveRequestVariable(value, path);
                    if (result.state !== ResolveState.Success) {
                        diagnostics.push(
                            new Diagnostic(
                                new Range(new Position(v.lineNumber, v.startIndex), new Position(v.lineNumber, v.endIndex)),
                                result.message,
                                result.state === ResolveState.Error ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning));
                    }
                });
            });

        this.httpDiagnosticCollection.set(document.uri, diagnostics);
    }

    private findVariableReferences(document: TextDocument): Map<string, Variable[]> {
        let vars: Map<string, Variable[]> = new Map<string, Variable[]>();
        let lines = document.getText().split(/\r?\n/g);
        let pattern = /\{\{(\w+)(\..*?)*\}\}/g;
        lines.forEach((line, lineNumber) => {
            let match: RegExpExecArray;
            while (match = pattern.exec(line)) {
                const [variablePath, variableName] = match;
                const variable = new Variable(
                    variableName,
                    variablePath,
                    match.index,
                    match.index + variablePath.length,
                    lineNumber
                );
                if (vars.has(variableName)) {
                    vars.get(variableName).push(variable);
                } else {
                    vars.set(variableName, [variable]);
                }
            }
        });

        return vars;
    }
}

class Variable {
    constructor(
        public variableName: string,
        public variableValue: string,
        public startIndex: number,
        public endIndex: number,
        public lineNumber: number) {

    }
}