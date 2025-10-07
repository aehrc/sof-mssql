/**
 * File discovery for NDJSON loader.
 * Scans directories and matches files against configurable patterns.
 *
 * @author John Grimes
 */

import { readdirSync, statSync } from "fs";
import { join } from "path";
import type { DiscoveredFile, LoaderOptions } from "./types.js";

/**
 * Default file pattern.
 * Format: {ResourceType}.ndjson
 * Example: Patient.ndjson
 */
const DEFAULT_PATTERN = "{ResourceType}.ndjson";

/**
 * Discover NDJSON files in a directory matching the specified pattern.
 *
 * @param options - Loader options containing directory and pattern.
 * @returns Array of discovered files with metadata.
 */
export function discoverFiles(options: LoaderOptions): DiscoveredFile[] {
  const pattern = options.pattern ?? DEFAULT_PATTERN;
  const files: DiscoveredFile[] = [];

  // Get all files from the directory.
  const entries = readdirSync(options.directory);

  for (const entry of entries) {
    const filePath = join(options.directory, entry);
    const stats = statSync(filePath);

    // Skip directories.
    if (stats.isDirectory()) {
      continue;
    }

    // Parse the filename against the pattern.
    const metadata = parseFilename(entry, pattern);

    // Skip files that don't match the pattern.
    if (!metadata) {
      continue;
    }

    // Apply resource type filter if specified.
    if (
      options.resourceType &&
      metadata.resourceType !== options.resourceType
    ) {
      continue;
    }

    files.push({
      path: filePath,
      resourceType: metadata.resourceType,
      size: stats.size,
    });
  }

  return files;
}

/**
 * Parse a filename against a pattern to extract resource type.
 *
 * Pattern placeholders:
 * - {ResourceType} - Required, matches the FHIR resource type.
 *
 * Example:
 * - Pattern: "{ResourceType}.ndjson" matches "Patient.ndjson" → { resourceType: "Patient" }
 *
 * @param filename - The filename to parse.
 * @param pattern - The pattern to match against.
 * @returns Metadata if the filename matches, undefined otherwise.
 */
export function parseFilename(
  filename: string,
  pattern: string,
): { resourceType: string } | undefined {
  // Convert the pattern to a regular expression.
  // Replace {ResourceType} with a named capture group that matches word characters.
  // FHIR resource types are PascalCase (e.g., Patient, Observation).
  let regexPattern = pattern.replace(
    "{ResourceType}",
    "(?<resourceType>[A-Z][A-Za-z0-9]*)",
  );

  // Escape special regex characters in the pattern (dots, etc.).
  regexPattern = regexPattern.replace(/\./g, "\\.");

  // Anchor the pattern to match the entire filename.
  regexPattern = `^${regexPattern}$`;

  const regex = new RegExp(regexPattern);
  const match = regex.exec(filename);

  if (!match?.groups) {
    return undefined;
  }

  const { resourceType } = match.groups;

  if (!resourceType) {
    return undefined;
  }

  return {
    resourceType,
  };
}

/**
 * Group discovered files by resource type.
 *
 * @param files - Array of discovered files.
 * @returns Map of resource type to files.
 */
export function groupFilesByResourceType(
  files: DiscoveredFile[],
): Map<string, DiscoveredFile[]> {
  const grouped = new Map<string, DiscoveredFile[]>();

  for (const file of files) {
    const existing = grouped.get(file.resourceType) ?? [];
    existing.push(file);
    grouped.set(file.resourceType, existing);
  }

  return grouped;
}
