import * as IR from '../../src/utils/ir';

import * as assert from 'assert';
import * as path from 'path';

import * as vscode from 'vscode';

suite("Include tests", () => {

	test("Can parse an include statement", async () => {
		let document = await vscode.workspace.openTextDocument(path.join(__dirname, "../../../test/includeTest/root.http"));
		let ir = await IR.parse(document);

		assert.equal(ir.children.length, 1);
		assert.equal(ir.children[0].type, IR.NodeType.Include);
		let includeNode = ir.children[0] as IR.IncludeNode;

		let childTextDocument = await vscode.workspace.openTextDocument(includeNode.absolutePath);
		let childDocument = await IR.parse(childTextDocument);
		assert.equal(childDocument.children.length, 1);
		let variableNode = childDocument.children[0] as IR.FileVariableNode;
		assert.equal(variableNode.type, IR.NodeType.FileVariable);
		assert.equal(variableNode.key, "foo");
		assert.equal(variableNode.value, "bar");
	});
});