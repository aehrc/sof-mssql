/**
 * Parses and interprets FHIRPath expressions for SQL generation.
 */

import { Transpiler, TranspilerContext } from "../fhirpath/transpiler.js";

/**
 * Result of parsing a FHIRPath expression with .where() function.
 */
export interface FhirPathWhereResult {
  path: string;
  whereCondition: string | null;
}

/**
 * Result of parsing array indexing from a path.
 */
export interface ArrayIndexingResult {
  path: string;
  arrayIndex: number | null;
}

/**
 * Result of parsing a path segment with array indexing.
 */
export interface SegmentIndexingResult {
  cleanSegment: string;
  segmentIndex: number | null;
}

/**
 * Handles parsing and interpretation of FHIRPath expressions.
 */
export class PathParser {
  private static readonly knownArrayFields = [
    "name",
    "telecom",
    "address",
    "contact",
    "identifier",
    "communication",
    "link",
  ];

  /**
   * Parse FHIRPath .where() function from a forEach path.
   * Transpiles the where condition to SQL using the FHIRPath transpiler.
   */
  parseFhirPathWhere(
    path: string,
    context: TranspilerContext,
  ): FhirPathWhereResult {
    // Find .where( in the path.
    const whereIndex = path.indexOf(".where(");
    if (whereIndex === -1) {
      return { path, whereCondition: null };
    }

    const basePath = path.substring(0, whereIndex);

    // Find the matching closing parenthesis using balanced counting.
    let parenCount = 0;
    let conditionEnd = -1;
    const whereStart = whereIndex + 7; // Position after ".where(".

    for (let i = whereStart; i < path.length; i++) {
      if (path[i] === "(") {
        parenCount++;
      } else if (path[i] === ")") {
        if (parenCount === 0) {
          conditionEnd = i;
          break;
        }
        parenCount--;
      }
    }

    if (conditionEnd === -1) {
      throw new Error(`Unmatched parentheses in .where() function: ${path}`);
    }

    const condition = path.substring(whereStart, conditionEnd).trim();
    let remainingPath = path.substring(conditionEnd + 1);

    // Handle .first() by converting it to [0] array indexing.
    if (remainingPath === ".first()") {
      remainingPath = "[0]";
    }

    // If there's a remaining path, append it to the base path.
    const fullPath = remainingPath ? `${basePath}${remainingPath}` : basePath;

    // Handle .where(false) - filter out everything.
    if (condition === "false") {
      return {
        path: fullPath,
        whereCondition: "1 = 0", // Always false.
      };
    }

    // Transpile the where condition using FHIRPath transpiler.
    try {
      const itemContext: TranspilerContext = {
        resourceAlias: "forEach_item",
        constants: context.constants,
        iterationContext: "value",
      };

      const sqlCondition = Transpiler.transpile(condition, itemContext);
      return {
        path: fullPath,
        whereCondition: sqlCondition,
      };
    } catch (error) {
      throw new Error(
        `Failed to transpile .where() condition "${condition}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Parse array indexing from a forEach path.
   * For paths like "contact.telecom[0]", interpret as "contact[0].telecom[0]" - apply index to all array segments.
   */
  parseArrayIndexing(path: string): ArrayIndexingResult {
    const match = /^(.+)\[(\d+)]$/.exec(path);
    if (!match) {
      return { path, arrayIndex: null };
    }

    const basePath = match[1];
    const arrayIndex = parseInt(match[2], 10);

    // Check if this is a multi-segment path (e.g., contact.telecom[0]).
    const segments = basePath.split(".");
    if (segments.length > 1) {
      // For contact.telecom[0], interpret as contact[0].telecom[0].
      const indexedPath = segments
        .map((seg) => {
          const cleanSeg = seg.replace(/\[.*]/, "");
          if (PathParser.knownArrayFields.includes(cleanSeg)) {
            return `${cleanSeg}[${arrayIndex}]`;
          }
          return cleanSeg;
        })
        .join(".");

      return {
        path: indexedPath,
        arrayIndex: null, // Index already applied in path.
      };
    }

    return {
      path: basePath,
      arrayIndex: arrayIndex,
    };
  }

  /**
   * Parse array indexing from a path segment.
   */
  parseSegmentIndexing(pathSegment: string): SegmentIndexingResult {
    const segmentMatch = /^(.+)\[(\d+)]$/.exec(pathSegment);
    return {
      cleanSegment: segmentMatch ? segmentMatch[1] : pathSegment,
      segmentIndex: segmentMatch ? parseInt(segmentMatch[2], 10) : null,
    };
  }

  /**
   * Detect if a forEach path requires array flattening.
   * Returns array of path segments that are arrays in FHIR Patient resource.
   */
  detectArrayFlatteningPaths(path: string): string[] {
    const segments = path.split(".");
    const arraySegments: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const cleanSegment = segment.replace(/\[.*]/, "");

      if (PathParser.knownArrayFields.includes(cleanSegment)) {
        arraySegments.push(segments.slice(0, i + 1).join("."));
      }
    }

    return arraySegments;
  }

  /**
   * Extract path segment for a specific level in array paths.
   */
  extractPathSegment(arrayPaths: string[], index: number): string {
    const fullPath = arrayPaths[index];
    const previousPath = index > 0 ? arrayPaths[index - 1] : "";
    return previousPath
      ? fullPath.substring(previousPath.length + 1)
      : fullPath;
  }
}
