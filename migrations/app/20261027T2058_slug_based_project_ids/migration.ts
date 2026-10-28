#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/ad13699f9d266993f19c54b0fc41e70109887dcc89719623a44cd0a6ee6e70b5/contract';
import startContract from '../../snapshots/ad13699f9d266993f19c54b0fc41e70109887dcc89719623a44cd0a6ee6e70b5/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b453671c664ec0bc2d0903716b96abd27c9ad17350cc575801e546857b819b29/contract';
import endContract from '../../snapshots/b453671c664ec0bc2d0903716b96abd27c9ad17350cc575801e546857b819b29/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    // Neither column can change type while the FK constraint exists: Postgres
    // refuses to re-implement a uuid->text FK in either direction, so the
    // constraint is dropped first and recreated after both conversions.
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'ProjectCollaborator',
        constraint: 'ProjectCollaborator_projectId_fkey',
        kind: 'foreignKey',
      }),
      this.alterColumnType({
        schema: 'public',
        table: 'ProjectCollaborator',
        column: 'projectId',
        type: 'text',
        using: '"projectId"::text',
      }),
      this.alterColumnType({
        schema: 'public',
        table: 'Project',
        column: 'id',
        type: 'text',
        using: 'id::text',
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ProjectCollaborator',
        foreignKey: {
          name: 'ProjectCollaborator_projectId_fkey',
          columns: ['projectId'],
          references: { schema: 'public', table: 'Project', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
