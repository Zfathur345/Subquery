// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import exp from 'constants';
import {
  TerraMessage,
  TerraEvent,
  SubqlTerraEventFilter,
  SubqlTerraMessageFilter,
  TerraBlock,
  TerraTransaction,
} from '@subql/types-terra';
import { LCDClient } from '@terra-money/terra.js';
import { ApiTerraService, TerraClient } from '../indexer/apiterra.service';
import { filterMessageData, filterEvents } from './terra-helper';

const ENDPOINT = 'https://terra-columbus-5.beta.api.onfinality.io';
const CHAIN_ID = 'columbus-5';
const MANTLEMINT =
  'https://mantlemint.terra-columbus-5.beta.api.onfinality.io:1320';

const TEST_TXHASH =
  'Cv8DCo8CCiYvdGVycmEud2FzbS52MWJldGExLk1zZ0V4ZWN1dGVDb250cmFjdBLkAQosdGVycmExMGNlamVjdXJmaDQ5cTN3cHhsOGFyM2cyd3Y0dDBjejRjNnFkNmESLHRlcnJhMWtjODdtdTQ2MGZ3a3F0ZTI5cnF1aDRoYzIwbTU0Znh3dHN4N2dwGoUBeyJzZW5kIjp7ImFtb3VudCI6IjE2ODY2NzU3IiwiY29udHJhY3QiOiJ0ZXJyYTFwdGpwMnZmanJ3aDBqMGZhajlyNmthdG02NDBrZ2p4bnd3cTlrbiIsIm1zZyI6ImV5SmtaWEJ2YzJsMFgyTnZiR3hoZEdWeVlXd2lPbnQ5ZlE9PSJ9fQrqAQomL3RlcnJhLndhc20udjFiZXRhMS5Nc2dFeGVjdXRlQ29udHJhY3QSvwEKLHRlcnJhMTBjZWplY3VyZmg0OXEzd3B4bDhhcjNnMnd2NHQwY3o0YzZxZDZhEix0ZXJyYTF0bW5xZ3ZnNTY3eXB2c3ZrNnJ3c2dhM3NycDdlM2xnNnUwZWxwOBpheyJsb2NrX2NvbGxhdGVyYWwiOnsiY29sbGF0ZXJhbHMiOltbInRlcnJhMWtjODdtdTQ2MGZ3a3F0ZTI5cnF1aDRoYzIwbTU0Znh3dHN4N2dwIiwiMTY4NjY3NTciXV19fRJpClEKRgofL2Nvc21vcy5jcnlwdG8uc2VjcDI1NmsxLlB1YktleRIjCiED5ExYV6EhC4Ru18uESC1i0L+xwg/f+CPFjN8bgkQSyHASBAoCCAEY9wQSFAoOCgR1dXNkEgYyNTA2NTcQwIQ9GkBzqEUdjvJ7fJEA9Zs1mbZbJU7s8c4dlb/x6dGzHmsXXQSdq2Xr53AzvBjh47gL0G+rEtoIB+49+3X1Tesqrrvy';

const TEST_MESSAGE_FILTER: SubqlTerraMessageFilter = {
  type: '/terra.wasm.v1beta1.MsgExecuteContract',
  contractCall: 'send',
  values: {
    contract: 'terra1kc87mu460fwkqte29rquh4hc20m54fxwtsx7gp',
  },
};

const TEST_EVENT_FILTER: SubqlTerraEventFilter = {
  type: 'wasm',
  messageFilter: TEST_MESSAGE_FILTER,
};

jest.setTimeout(100000);

describe('TerraUtils', () => {
  let api: TerraClient;

  beforeAll(() => {
    const client = new LCDClient({
      URL: ENDPOINT,
      chainID: CHAIN_ID,
    });
    api = new TerraClient(client, ENDPOINT, {}, MANTLEMINT);
  });

  it('filter message data for true', async () => {
    const txInfo = await api.txInfo(TEST_TXHASH);
    const message: TerraMessage = {
      idx: 0,
      block: {} as TerraBlock,
      tx: {} as TerraTransaction,
      msg: txInfo.tx.body.messages[0],
    };
    const result = filterMessageData(message, TEST_MESSAGE_FILTER);
    expect(result).toEqual(true);
  });

  it('filter message data for false', async () => {
    const txInfo = await api.txInfo(TEST_TXHASH);
    const message: TerraMessage = {
      idx: 1,
      block: {} as TerraBlock,
      tx: {} as TerraTransaction,
      msg: txInfo.tx.body.messages[1],
    };
    const result = filterMessageData(message, TEST_MESSAGE_FILTER);
    expect(result).toEqual(false);
  });
});
