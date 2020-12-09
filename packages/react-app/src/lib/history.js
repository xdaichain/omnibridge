import { gql, request } from 'graphql-request';

import { Web3Context } from '../contexts/Web3Context';
import { getGraphEndpoint, getBridgeNetwork } from './helpers';
import { useContext, useEffect, useState } from 'react';

const pageSize = 1000;

const historyQuery = gql`
  query getHistory($user: String!, $first: Int!, $skip: Int!) {
    requests: userRequests(
      where: { user_contains: $user }
      first: $first
      skip: $skip
    ) {
      txHash
      messageId
      timestamp
      amount
      token
      message {
        msgData
        signatures
      }
    }
    executions(where: { user_contains: $user }, first: $first, skip: $skip) {
      txHash
      messageId
    }
  }
`;

export const getTransfers = async (user, chainId) => {
  let requests = [];
  let executions = [];
  let page = 0;
  const first = pageSize;

  while (true) {
    const data = await request(getGraphEndpoint(chainId), historyQuery, {
      user,
      first,
      skip: page * pageSize,
    });
    if (data) {
      requests = data.requests.concat(requests);
      executions = data.executions.concat(executions);
    }
    if (
      !data ||
      (data.requests.length < pageSize && data.executions.length < pageSize)
    )
      break;
    page++;
  }

  return { requests, executions };
};

function combineRequestsWithExecutions(requests, executions, chainId) {
  return requests.map(request => {
    const execution = executions.find(
      execution => execution.messageId === request.messageId,
    );
    return {
      chainId,
      timestamp: request.timestamp,
      sendingTx: request.txHash,
      receivingTx: execution ? execution.txHash : null,
      amount: request.amount,
      token: request.token,
      message: { ...request.message, messageId: request.messageId },
    };
  });
}

export function useUserHistory() {
  const { network, account } = useContext(Web3Context);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const chainId = network.value;
  const bridgeChainId = getBridgeNetwork(chainId);

  useEffect(() => {
    if (!account || !network.value) return;
    async function update() {
      const [
        { requests: homeRequests, executions: homeExecutions },
        { requests: foreignRequests, executions: foreignExecutions },
      ] = await Promise.all([
        getTransfers(account, chainId),
        getTransfers(account, bridgeChainId),
      ]);
      const homeTransfers = combineRequestsWithExecutions(
        homeRequests,
        foreignExecutions,
        chainId,
      );
      const foreignTransfers = combineRequestsWithExecutions(
        foreignRequests,
        homeExecutions,
        bridgeChainId,
      );
      const allTransfers = [...homeTransfers, ...foreignTransfers].sort(
        (a, b) => b.timestamp - a.timestamp,
      );
      setTransfers(allTransfers);
      setLoading(false);
    }
    update();
    const interval = 10000; // 10 seconds
    const intervalId = setInterval(update, interval);
    return () => clearInterval(intervalId);
  }, [account]);

  return { transfers, loading };
}

// historyItem: {
//     chainId,
//     timestamp,
//     sendingTx,
//     receivingTx,
//     amount,
//     token,
//     messageData,
//     signatures,
// }

// const historyQuery = gql`
//   query getHistory($user: String!, $skip: Int!) {
//     userRequests(
//       first: 10
//       skip: $skip
//       orderBy: timestamp
//       where: { user_contains: $user }
//       orderDirection: desc
//     ) {
//       txHash
//       messageId
//       timestamp
//       message {
//         msgData
//         signatures
//       }
//     }
//     executions {
//       txHash
//       messageId
//     }
//   }
// `;

// export const fetchHistory = async (chainId, user, page) => {
//   if (!user) return [];

//   const endpoint = getGraphEndpoint(chainId);

//   const variables = {
//     user,
//     skip: (page - 1) * 10,
//   };

//   const data = await request(endpoint, historyQuery, variables);

//   if (!data) return [];

//   return data.userRequests;
// };

// const fullHistoryQuery = gql`
//   query getFullHistory($user: String!) {
//     userRequests(where: { user_contains: $user }) {
//       id
//     }
//   }
// `;

// export const fetchNumHistoryForChainId = async (chainId, user) => {
//   if (!user) return 0;

//   const endpoint = getGraphEndpoint(chainId);

//   const variables = {
//     user,
//   };

//   const data = await request(endpoint, fullHistoryQuery, variables);

//   if (!data) return 0;

//   return data.userRequests.length;
// };

// export const fetchNumHistory = async (chainId, user) => {
//   const [here, there] = await Promise.all([
//     fetchNumHistoryForChainId(chainId, user),
//     fetchNumHistoryForChainId(getBridgeNetwork(chainId), user),
//   ]);
//   return here + there;
// };
