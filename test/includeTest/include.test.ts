import * as Ast from '../../src/utils/ast';

import * as assert from 'assert';
import * as path from 'path';

import * as vscode from 'vscode';

suite("Include tests", () => {

	test("Can parse an include statement", async () => {
		let document = await vscode.workspace.openTextDocument(path.join(__dirname, "../../../test/includeTest/root.http"));
		let ir = await Ast.parse(document);

		assert.equal(ir.children.length, 1);
		assert.equal(ir.children[0].type, Ast.NodeType.Include);
		let includeNode = ir.children[0] as Ast.IncludeNode;

		let childTextDocument = await vscode.workspace.openTextDocument(includeNode.path.absolutePath);
		let childDocument = Ast.parse(childTextDocument);
		assert.equal(childDocument.children.length, 1);
		let variableNode = childDocument.children[0] as Ast.FileVariableNode;
		assert.equal(variableNode.type, Ast.NodeType.FileVariable);
		assert.equal(variableNode.key, "foo");
		assert.equal(variableNode.value, "bar");
	});
});