/**
 * Walker for UnionAll nodes.
 *
 * Emits a local derived table with one SELECT per branch, joined by
 * `UNION ALL`, wrapped as `CROSS APPLY (...) AS ua_<n>`. CTEs from any
 * branch (e.g. enclosed Repeats) bubble up to the top-level WITH clause.
 *
 * Branches must produce the same column names and types (SoF spec
 * requirement). The walker aligns them positionally — branch[0]'s names
 * become the outer projection.
 *
 * If the same node also has `column[]` or `select[]` alongside `unionAll`,
 * those are emitted as outer siblings (they live in the SELECT list at the
 * same level as the ua_<n> projection, evaluated in the parent scope).
 */

import type { ViewDefinitionSelect } from "../../../types.js";
import type { ColumnExpressionGenerator } from "../../ColumnExpressionGenerator.js";
import { freshAlias } from "../aliasGenerator.js";
import { mergeSiblings } from "../mergeSiblings.js";
import type {
  Context,
  CteDefinition,
  Fragment,
  ProjectedColumn,
} from "../types.js";
import { projectColumns } from "./columnsOnly.js";

export interface UnionAllDeps {
  columnGenerator: ColumnExpressionGenerator;
}

/**
 * Walker for UnionAll nodes.
 *
 * Walks each branch of `node.unionAll` in the current context and assembles
 * them into a `CROSS APPLY (...) AS ua_<n>` derived table where each branch
 * contributes a `SELECT … FROM (SELECT 1 AS _) AS _seed …` statement joined
 * by `UNION ALL`.  Branch columns are aligned positionally to branch[0]'s
 * names, satisfying the SoF spec requirement that all branches produce the
 * same column names and types.
 *
 * CTEs from any branch (e.g. produced by enclosed Repeat nodes) bubble up
 * into the returned Fragment's `ctes` list so they appear in the top-level
 * `WITH` clause.
 *
 * If the same node also carries `column[]` or `select[]` alongside
 * `unionAll`, those are emitted as outer siblings in the enclosing SELECT
 * scope and merged with the union fragment via `mergeSiblings`.
 *
 * @param node - The UnionAll select node; `node.unionAll` must be a non-empty
 *   array of branch select nodes.
 * @param ctx - The current walker context, passed unchanged to every branch
 *   and to any sibling column/select processing.
 * @param walk - The recursive walk function used to visit each branch and any
 *   outer sibling select nodes.
 * @param deps - Dependencies containing the `ColumnExpressionGenerator` used
 *   to project any outer sibling `column[]` entries.
 * @returns A Fragment whose `fromExtensions` contains the `CROSS APPLY`
 *   derived-table clause, `ctes` aggregates all branch CTEs, and `columns`
 *   contains the outer projection (plus any sibling columns).
 * @throws {Error} When `node.unionAll` is empty.
 */
export function walkUnionAll(
  node: ViewDefinitionSelect,
  ctx: Context,
  walk: (n: ViewDefinitionSelect, c: Context) => Fragment,
  deps: UnionAllDeps,
): Fragment {
  const branches = node.unionAll ?? [];
  if (branches.length === 0) throw new Error("walkUnionAll: empty unionAll");

  const branchFragments: Fragment[] = branches.map((b) => walk(b, ctx));
  const uaFragment = buildUnionAllFragment(branchFragments, ctx);
  const outerSiblings = collectOuterSiblings(node, ctx, walk, deps);

  return outerSiblings.length === 0
    ? uaFragment
    : mergeSiblings([...outerSiblings, uaFragment], ctx);
}

function buildUnionAllFragment(
  branchFragments: Fragment[],
  ctx: Context,
): Fragment {
  const uaAlias = freshAlias(ctx, "ua");
  const allCtes: CteDefinition[] = branchFragments.flatMap((f) => f.ctes);
  const referenceColumns = branchFragments[0].columns;
  const branchSqls = branchFragments.map((f) =>
    renderBranchSelect(f, referenceColumns),
  );
  const unionDerivedTable = `(\n  ${branchSqls.join(
    "\n  UNION ALL\n  ",
  )}\n) AS ${uaAlias}`;
  const uaColumns: ProjectedColumn[] = referenceColumns.map((c) => ({
    name: c.name,
    sqlExpr: `${uaAlias}.[${c.name}]`,
  }));
  return {
    ctes: allCtes,
    fromExtensions: `\nCROSS APPLY ${unionDerivedTable}`,
    columns: uaColumns,
    partitionKeys: ctx.partitionKeys,
  };
}

function collectOuterSiblings(
  node: ViewDefinitionSelect,
  ctx: Context,
  walk: (n: ViewDefinitionSelect, c: Context) => Fragment,
  deps: UnionAllDeps,
): Fragment[] {
  const out: Fragment[] = [];
  if (node.column && node.column.length > 0) {
    out.push({
      ctes: [],
      fromExtensions: "",
      columns: projectColumns(node.column, ctx, deps.columnGenerator),
      partitionKeys: ctx.partitionKeys,
    });
  }
  if (node.select) {
    for (const child of node.select) out.push(walk(child, ctx));
  }
  return out;
}

/**
 * Renders one branch's SELECT inside the unionAll derived table.
 *
 * The seed `(SELECT 1 AS _) AS _seed` ensures the branch always has a
 * FROM clause to attach its CROSS/OUTER APPLY chain to, and keeps the SQL
 * uniform whether the branch has operators or not. No unique suffix is
 * needed because each SELECT in a UNION ALL has its own independent FROM
 * scope — `_seed` in one branch cannot collide with `_seed` in another.
 *
 * Columns are re-aliased to branch[0]'s names so the outer projection by
 * name works for every branch row.
 */
function renderBranchSelect(
  fragment: Fragment,
  referenceColumns: ProjectedColumn[],
): string {
  const projection = referenceColumns
    .map((ref, i) => {
      const branchCol = fragment.columns[i];
      if (!branchCol) {
        throw new Error(
          `unionAll branch is missing column at index ${i} (expected '${ref.name}')`,
        );
      }
      return `${branchCol.sqlExpr} AS [${ref.name}]`;
    })
    .join(", ");
  return `SELECT ${projection} FROM (SELECT 1 AS _) AS _seed${fragment.fromExtensions}`;
}
