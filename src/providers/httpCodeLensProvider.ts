'use strict';

import { CancellationToken, CodeLens, CodeLensProvider, Command, Range, TextDocument } from 'vscode';
import * as Constants from '../common/constants';
import { Selector } from '../utils/selector';
import * as Ast from '../utils/ast';

export class HttpCodeLensProvider implements CodeLensProvider {
    public async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        let ast = Ast.parse(document);

        let blocks: CodeLens[] = [];

        for (let node of ast.children)
        {
            if (node.type != Ast.NodeType.Request)
                continue;

            const cmd: Command = {
                arguments: [document, node.range],
                title: 'Send Request',
                command: 'bember-rest-client.request'
            };
            blocks.push(new CodeLens(node.range, cmd));
        }

        return Promise.resolve(blocks);
    }
}