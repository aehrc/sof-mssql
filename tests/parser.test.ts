/**
 * Tests for ViewDefinition parser.
 */

import { ViewDefinitionParser } from '../src/parser';
import { ViewDefinition } from '../src/types';

describe('ViewDefinitionParser', () => {
  const validViewDefinition = {
    resourceType: 'ViewDefinition',
    resource: 'Patient',
    status: 'active',
    name: 'test_view',
    select: [
      {
        column: [
          {
            name: 'id',
            path: 'id',
            type: 'id'
          },
          {
            name: 'gender',
            path: 'gender',
            type: 'code'
          }
        ]
      }
    ]
  };

  describe('parseViewDefinition', () => {
    it('should parse a valid ViewDefinition', () => {
      const result = ViewDefinitionParser.parseViewDefinition(validViewDefinition);
      expect(result.resourceType).toBe('ViewDefinition');
      expect(result.resource).toBe('Patient');
      expect(result.select).toHaveLength(1);
    });

    it('should parse ViewDefinition from JSON string', () => {
      const json = JSON.stringify(validViewDefinition);
      const result = ViewDefinitionParser.parseViewDefinition(json);
      expect(result.resource).toBe('Patient');
    });

    it('should throw error for invalid resource type', () => {
      const invalid = { ...validViewDefinition, resourceType: 'Patient' };
      expect(() => ViewDefinitionParser.parseViewDefinition(invalid))
        .toThrow('Invalid resource type');
    });

    it('should throw error for missing resource', () => {
      const invalid = { ...validViewDefinition };
      delete (invalid as any).resource;
      expect(() => ViewDefinitionParser.parseViewDefinition(invalid))
        .toThrow('must specify a resource type');
    });

    it('should throw error for missing select', () => {
      const invalid = { ...validViewDefinition };
      delete (invalid as any).select;
      expect(() => ViewDefinitionParser.parseViewDefinition(invalid))
        .toThrow('must have at least one select element');
    });

    it('should throw error for invalid column name', () => {
      const invalid = {
        ...validViewDefinition,
        select: [
          {
            column: [
              {
                name: '123invalid',
                path: 'id',
                type: 'id'
              }
            ]
          }
        ]
      };
      expect(() => ViewDefinitionParser.parseViewDefinition(invalid))
        .toThrow('not database-friendly');
    });
  });

  describe('getColumnNames', () => {
    it('should extract column names in order', () => {
      const viewDef = ViewDefinitionParser.parseViewDefinition(validViewDefinition);
      const columns = ViewDefinitionParser.getColumnNames(viewDef);
      expect(columns).toEqual(['id', 'gender']);
    });

    it('should handle nested selects', () => {
      const nestedViewDef = {
        ...validViewDefinition,
        select: [
          {
            column: [
              { name: 'id', path: 'id', type: 'id' }
            ]
          },
          {
            select: [
              {
                column: [
                  { name: 'given_name', path: 'name.given', type: 'string' }
                ]
              }
            ]
          }
        ]
      };
      
      const viewDef = ViewDefinitionParser.parseViewDefinition(nestedViewDef);
      const columns = ViewDefinitionParser.getColumnNames(viewDef);
      expect(columns).toEqual(['id', 'given_name']);
    });
  });

  describe('parseTestSuite', () => {
    const validTestSuite = {
      title: 'Test Suite',
      description: 'Test description',
      fhirVersion: ['4.0.1'],
      resources: [
        {
          resourceType: 'Patient',
          id: 'test-patient',
          gender: 'male'
        }
      ],
      tests: [
        {
          title: 'Test Case',
          tags: ['basic'],
          view: validViewDefinition,
          expect: [
            { id: 'test-patient', gender: 'male' }
          ]
        }
      ]
    };

    it('should parse a valid test suite', () => {
      const result = ViewDefinitionParser.parseTestSuite(validTestSuite);
      expect(result.title).toBe('Test Suite');
      expect(result.tests).toHaveLength(1);
      expect(result.resources).toHaveLength(1);
    });

    it('should throw error for missing required fields', () => {
      const invalid = { title: 'Test' };
      expect(() => ViewDefinitionParser.parseTestSuite(invalid))
        .toThrow('Missing required fields');
    });
  });
});