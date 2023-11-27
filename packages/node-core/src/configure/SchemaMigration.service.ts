// Copyright 2020-2023 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {
  Sequelize,
  Transaction,
  ModelAttributes,
  ModelAttributeColumnOptions,
  Model,
  DataType,
} from '@subql/x-sequelize';
import {
  GraphQLSchema,
  ObjectTypeDefinitionNode,
  parse,
  printSchema,
  visit,
  NameNode,
  DefinitionNode,
  TypeNode,
} from 'graphql';
import {getLogger} from '../logger';
import {NodeConfig} from './NodeConfig';

interface FieldDetailsType {
  fieldName: string;
  type: string; // Int, String... etc
  nullable?: boolean;
  // TODO list all other fields, uniqueBy ..etc
}
export interface EntityChanges {
  addedFields: FieldDetailsType[];
  removedFields: FieldDetailsType[];
  // modifiedFields: Record<
  //   string,
  //   {
  //     type: {from: string; to: string};
  //     kind: {from: string; to: string};
  //   }
  // >; // i think from and to can be enums
}

export interface SchemaChanges {
  addedEntities: string[];
  removedEntities: string[];
  modifiedEntities: Record<string, EntityChanges>;
}

// export interface ISchemaMigrationService {
//     schemaComparator(currentSchema: GraphQLSchema, nextSchema: GraphQLSchema):
// }

const logger = getLogger('SchemaMigrationService');
// need test for this
export function extractTypeDetails(typeNode: TypeNode): {type: string; kind: string} {
  let currentTypeNode: TypeNode = typeNode;

  while (currentTypeNode.kind === 'NonNullType' || currentTypeNode.kind === 'ListType') {
    currentTypeNode = currentTypeNode.type;
  }

  const name = currentTypeNode.kind === 'NamedType' ? currentTypeNode.name.value : '';

  return {type: currentTypeNode.kind, kind: name};
}

export class SchemaMigrationService {
  private readonly _currentSchema: GraphQLSchema;
  private readonly _nextSchema: GraphQLSchema;
  private _sequelize: Sequelize;
  constructor(currentSchema: GraphQLSchema, nextSchema: GraphQLSchema, config: NodeConfig, sequelize: Sequelize) {
    this._sequelize = sequelize;
    this._currentSchema = currentSchema;
    this._nextSchema = nextSchema;
  }
  static compareSchema(currentSchema: GraphQLSchema, nextSchema: GraphQLSchema): SchemaChanges {
    const currentSchemaString = printSchema(currentSchema);
    const nextSchemaString = printSchema(nextSchema);

    // Parse the schema strings into AST
    const currentSchemaAST = parse(currentSchemaString);
    const nextSchemaAST = parse(nextSchemaString);

    const changes: SchemaChanges = {
      addedEntities: [],
      removedEntities: [],
      modifiedEntities: {},
    };

    visit(nextSchemaAST, {
      ObjectTypeDefinition(node) {
        const typeName = node.name.value;
        const oldTypeNode = currentSchemaAST.definitions.find(
          (def: any) => def.kind === 'ObjectTypeDefinition' && def.name.value === typeName
        ) as ObjectTypeDefinitionNode;

        if (oldTypeNode === undefined) {
          changes.addedEntities.push(typeName);
        } else {
          const newFields = node.fields?.map((field) => field) || [];
          const oldFields = oldTypeNode.fields?.map((field) => field) || [];

          const addedFields: FieldDetailsType[] = newFields
            .filter((field) => !oldFields.some((oldField) => oldField.name.value === field.name.value))
            .map((field) => ({
              fieldName: field.name.value,
              type: extractTypeDetails(field.type).kind,
              nullable: !field.type.kind.includes('NonNullType'),
            }));
          const removedFields: FieldDetailsType[] = oldFields
            .filter((field) => !newFields.some((newField) => newField.name.value === field.name.value))
            .map((field) => ({
              fieldName: field.name.value,
              type: extractTypeDetails(field.type).kind,
              nullable: !field.type.kind.includes('NonNullType'),
            }));

          const modifiedFields: Record<string, {old: FieldDetailsType; new: FieldDetailsType}> = {};

          if (node.fields) {
            node.fields.forEach((newField) => {
              const oldField = oldFields.find((oldField) => oldField.name.value === newField.name.value);

              if (oldField) {
                const newFieldDetails = {
                  fieldName: newField.name.value,
                  type: extractTypeDetails(newField.type).kind,
                  nullable: !newField.type.kind.includes('NonNullType'),
                };

                const oldFieldDetails = {
                  fieldName: oldField.name.value,
                  type: extractTypeDetails(oldField.type).kind,
                  nullable: !oldField.type.kind.includes('NonNullType'),
                };

                if (
                  newFieldDetails.type !== oldFieldDetails.type ||
                  newFieldDetails.nullable !== oldFieldDetails.nullable
                ) {
                  modifiedFields[newField.name.value] = {old: oldFieldDetails, new: newFieldDetails};
                }
              }
            });

            for (const fieldName in modifiedFields) {
              const {new: newDetails, old} = modifiedFields[fieldName];
              changes.modifiedEntities[typeName] = changes.modifiedEntities[typeName] || {
                addedFields: [],
                removedFields: [],
              };
              changes.modifiedEntities[typeName].addedFields.push(newDetails);
              changes.modifiedEntities[typeName].removedFields.push(old);
            }

            changes.modifiedEntities[typeName] = {
              addedFields: [...(changes.modifiedEntities[typeName]?.addedFields || []), ...addedFields],
              removedFields: [...(changes.modifiedEntities[typeName]?.removedFields || []), ...removedFields],
            };
          }
        }
      },
    });

    // Detecting types removed in the new schema
    visit(currentSchemaAST, {
      ObjectTypeDefinition(node) {
        const typeName = node.name.value;
        const typeExistsInNew = nextSchemaAST.definitions.some(
          (def: DefinitionNode) => def.kind === 'ObjectTypeDefinition' && def.name.value === typeName
        );

        if (!typeExistsInNew) {
          changes.removedEntities.push(typeName);
        }
      },
    });
    return changes;
  }

  async init(): Promise<void> {
    const transaction = await this._sequelize.transaction();
    const {addedEntities, modifiedEntities, removedEntities} = SchemaMigrationService.compareSchema(
      this._currentSchema,
      this._nextSchema
    );

    try {
      // Remove should always occur before create
      if (removedEntities.length) {
        await Promise.all(removedEntities.map((entity) => this.dropTable(entity, transaction)));
      }

      if (addedEntities.length) {
        // how do i get modelAttributes ???
        // Promise.all(addedEntities.map(entity => this.createTable(
        //     entity,
        // )))
      }
      const dropColumnExecutables: Promise<void>[] = [];
      const createColumnExecutables: Promise<void>[] = [];

      if (Object.keys(modifiedEntities).length) {
        const entities = Object.keys(modifiedEntities);
        entities.forEach((entity) => {
          const entityValues = modifiedEntities[entity];

          entityValues.removedFields.forEach((field) => {
            dropColumnExecutables.push(this.dropColumn(entity, field.fieldName, transaction));
          });

          entityValues.addedFields.forEach((field) => {
            // TODO ensure that field.type is correct
            createColumnExecutables.push(this.createColumn(entity, field.fieldName, field.type, transaction));
          });
        });
      }

      await Promise.all(dropColumnExecutables);
      await Promise.all(createColumnExecutables);

      await transaction.commit();
    } catch (e: any) {
      await transaction.rollback();
      throw new Error(e);
    }
  }

  private async createColumn(
    tableName: string,
    columnName: string,
    dataType: ModelAttributeColumnOptions<Model<any, any>> | DataType,
    transaction: Transaction
  ): Promise<void> {
    await this._sequelize.getQueryInterface().addColumn(tableName, columnName, dataType, {transaction});
  }
  private async dropColumn(tableName: string, columnName: string, transaction: Transaction): Promise<void> {
    await this._sequelize.getQueryInterface().removeColumn(tableName, columnName, {transaction});
  }
  private async createTable(tableName: string, attributes: ModelAttributes, transaction: Transaction): Promise<void> {
    await this._sequelize.getQueryInterface().createTable(tableName, attributes, {transaction});
  }
  private async dropTable(tableName: string, transaction: Transaction): Promise<void> {
    await this._sequelize.getQueryInterface().dropTable(tableName, {transaction});
  }
  private async createIndex() {
    //
  }
  private async dropIndex() {
    //
  }
}
