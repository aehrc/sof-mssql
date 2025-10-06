/**
 * Expands unionAll combinations from ViewDefinition select elements.
 */

import { ViewDefinitionSelect } from "../types.js";

/**
 * Represents a specific combination of selects with their unionAll choices.
 */
export interface SelectCombination {
  selects: ViewDefinitionSelect[];
  unionChoices: number[]; // -1 means no union choice, >= 0 means index in unionAll array.
}

/**
 * Handles expansion of all possible unionAll combinations.
 */
export class SelectCombinationExpander {
  /**
   * Expand all possible unionAll combinations from select elements.
   */
  expandCombinations(selects: ViewDefinitionSelect[]): SelectCombination[] {
    let combinations: SelectCombination[] = [{ selects: [], unionChoices: [] }];

    for (const select of selects) {
      combinations = this.expandSelectCombinations(select, combinations);
    }

    return combinations;
  }

  /**
   * Expand combinations for a single select element.
   * Handles nested unionAll by recursively expanding them.
   */
  private expandSelectCombinations(
    select: ViewDefinitionSelect,
    currentCombinations: SelectCombination[],
  ): SelectCombination[] {
    const newCombinations: SelectCombination[] = [];

    for (const combination of currentCombinations) {
      if (select.unionAll && select.unionAll.length > 0) {
        this.expandUnionAllOptions(select, combination, newCombinations);
      } else {
        this.addNonUnionCombination(select, combination, newCombinations);
      }
    }

    return newCombinations;
  }

  /**
   * Expand unionAll options for a select.
   */
  private expandUnionAllOptions(
    select: ViewDefinitionSelect,
    combination: SelectCombination,
    newCombinations: SelectCombination[],
  ): void {
    const unionAll = select.unionAll;
    if (!unionAll) return;

    for (let i = 0; i < unionAll.length; i++) {
      const unionOption = unionAll[i];

      if (unionOption.unionAll && unionOption.unionAll.length > 0) {
        this.expandNestedUnion(
          select,
          i,
          unionOption,
          combination,
          newCombinations,
        );
      } else {
        this.addSimpleUnionCombination(select, i, combination, newCombinations);
      }
    }
  }

  /**
   * Expand nested unionAll within a unionAll option.
   */
  private expandNestedUnion(
    select: ViewDefinitionSelect,
    unionIndex: number,
    unionOption: ViewDefinitionSelect,
    combination: SelectCombination,
    newCombinations: SelectCombination[],
  ): void {
    const nestedCombinations = this.expandSelectCombinations(unionOption, [
      { selects: [], unionChoices: [] },
    ]);

    for (const nestedComb of nestedCombinations) {
      const newCombination: SelectCombination = {
        selects: [...combination.selects, select, ...nestedComb.selects],
        unionChoices: [
          ...combination.unionChoices,
          unionIndex,
          ...nestedComb.unionChoices,
        ],
      };
      newCombinations.push(newCombination);
    }
  }

  /**
   * Add a simple unionAll combination (no nested unionAll).
   */
  private addSimpleUnionCombination(
    select: ViewDefinitionSelect,
    unionIndex: number,
    combination: SelectCombination,
    newCombinations: SelectCombination[],
  ): void {
    const newCombination: SelectCombination = {
      selects: [...combination.selects, select],
      unionChoices: [...combination.unionChoices, unionIndex],
    };
    newCombinations.push(newCombination);
  }

  /**
   * Add a combination for a select without unionAll.
   */
  private addNonUnionCombination(
    select: ViewDefinitionSelect,
    combination: SelectCombination,
    newCombinations: SelectCombination[],
  ): void {
    const newCombination: SelectCombination = {
      selects: [...combination.selects, select],
      unionChoices: [...combination.unionChoices, -1],
    };
    newCombinations.push(newCombination);
  }
}
