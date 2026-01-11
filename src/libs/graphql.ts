import type { GraphQLResolveInfo, FieldNode, SelectionNode } from "graphql";

function getDepthFromSelection(selection: SelectionNode | FieldNode, currentDepth: number): number {
  if (selection.kind === "Field" && selection.selectionSet) {
    const childDepths = selection.selectionSet.selections.map((sel) =>
      getDepthFromSelection(sel, currentDepth + 1)
    );
    return Math.max(currentDepth, ...childDepths);
  }
  return currentDepth;
}

export function getQueryDepth(info: GraphQLResolveInfo): number {
  return getDepthFromSelection(info.fieldNodes[0]!, 1);
}

export interface FieldTree {
  [key: string]: boolean | FieldTree;
}

export const getQueryFragment = (
  info: GraphQLResolveInfo,
  selectFields: FieldTree,
  field: SelectionNode
) => {
  if (field.kind === "FragmentSpread") {
    const fragment = info.fragments[field.name.value];
    fragment?.selectionSet.selections.forEach((selection) => {
      getQueryFragment(info, selectFields, selection);
    });
  } else if (field.kind === "Field" && field.name.value !== "__typename") {
    if (field.selectionSet?.selections.length) {
      selectFields[field.name.value] = getQueryFields(info, [field]);
    } else {
      selectFields[field.name.value] = true;
    }
  }
};

export const getQueryFields = (info: GraphQLResolveInfo, fieldNodes?: FieldNode[]) => {
  const selectFields: FieldTree = {};
  for (const fieldNode of fieldNodes ?? info.fieldNodes) {
    for (const field of fieldNode.selectionSet!.selections) {
      getQueryFragment(info, selectFields, field);
    }
  }
  return selectFields;
};
