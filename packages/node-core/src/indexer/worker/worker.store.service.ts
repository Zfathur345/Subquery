// Copyright 2020-2021 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import {Store} from '@subql/types';
import {classToPlain} from 'class-transformer';

export type HostStore = {
  // This matches the store interface
  storeCount: (
    entity: string,
    field?: string,
    value?: any,
    options?: {distinct?: boolean; col?: string}
  ) => Promise<number>;
  storeGet: (entity: string, id: string) => Promise<any | null>;
  storeGetByField: (
    entity: string,
    field: string,
    value: any,
    options?: {offset?: number; limit?: number}
  ) => Promise<any[]>;
  storeGetOneByField: (entity: string, field: string, value: any) => Promise<any | null>;
  storeSet: (entity: string, id: string, data: any) => Promise<void>;
  storeBulkCreate: (entity: string, data: any[]) => Promise<void>;
  storeBulkUpdate: (entity: string, data: any[], fields?: string[]) => Promise<void>;
  storeRemove: (entity: string, id: string) => Promise<void>;
};

export const hostStoreKeys: (keyof HostStore)[] = [
  'storeCount',
  'storeGet',
  'storeGetByField',
  'storeGetOneByField',
  'storeSet',
  'storeBulkCreate',
  'storeBulkUpdate',
  'storeRemove',
];

export const hostStoreToStore = (host: HostStore): Store => {
  return {
    count: host.storeCount,
    get: host.storeGet,
    getByField: host.storeGetByField,
    getOneByField: host.storeGetOneByField,
    set: (entity, id, data) => host.storeSet(entity, id, classToPlain(data)),
    bulkCreate: (entity, data) =>
      host.storeBulkCreate(
        entity,
        data.map((d) => classToPlain(d))
      ),
    bulkUpdate: (entity, data, fields) =>
      host.storeBulkUpdate(
        entity,
        data.map((d) => classToPlain(d)),
        fields
      ),
    remove: host.storeRemove,
  };
};