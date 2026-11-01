import { connect, signers } from "@hyperledger/fabric-gateway";
import { credentials, Client } from "@grpc/grpc-js";
import { createPrivateKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const config = {
  peerEndpoint: process.env.FABRIC_PEER_ENDPOINT ?? "localhost:7051",
  peerHostAlias:
    process.env.FABRIC_PEER_HOST_ALIAS ?? "peer0.org1.example.com",
  tlsCertPath:
    process.env.FABRIC_TLS_CERT_PATH ??
    "certs/fabric/org1/peer-tls-ca.crt",
  identityCertPath:
    process.env.FABRIC_IDENTITY_CERT_PATH ??
    "certs/fabric/org1/identity-cert.pem",
  privateKeyPath:
    process.env.FABRIC_PRIVATE_KEY_PATH ??
    "certs/fabric/org1/private-key.pem",
  mspId: process.env.FABRIC_MSP_ID ?? "Org1MSP",
  channelName: process.env.FABRIC_CHANNEL ?? "residuguard-channel",
  chaincodeName: process.env.FABRIC_CHAINCODE ?? "residuguard",
};

let gatewayInstance: ReturnType<typeof connect> | null = null;
let grpcClient: Client | null = null;

export async function getFabricContract() {
  if (gatewayInstance) {
    return gatewayInstance
      .getNetwork(config.channelName)
      .getContract(config.chaincodeName);
  }

  const tlsCert = await readFile(resolve(config.tlsCertPath));
  const identityCert = await readFile(resolve(config.identityCertPath));
  const privateKeyPem = await readFile(resolve(config.privateKeyPath));

  const privateKey = createPrivateKey(privateKeyPem);

  grpcClient = new Client(
    config.peerEndpoint,
    credentials.createSsl(tlsCert),
    {
      "grpc.ssl_target_name_override": config.peerHostAlias,
      "grpc.default_authority": config.peerHostAlias,
    },
  );

  try {
    gatewayInstance = connect({
      client: grpcClient,
      identity: {
        mspId: config.mspId,
        credentials: identityCert,
      },
      signer: signers.newPrivateKeySigner(privateKey),
    });

    const network = gatewayInstance.getNetwork(config.channelName);

    return network.getContract(config.chaincodeName);
  } catch (error) {
    grpcClient.close();
    grpcClient = null;
    throw error;
  }
}

export async function disconnectFabric(): Promise<void> {
  if (gatewayInstance) {
    gatewayInstance.close();
    gatewayInstance = null;
  }

  if (grpcClient) {
    grpcClient.close();
    grpcClient = null;
  }
}

export async function evaluateFabricTransaction(
  transactionName: string,
  ...args: string[]
): Promise<string> {
  const contract = await getFabricContract();

  const result = await contract.evaluateTransaction(transactionName, ...args);

  return new TextDecoder().decode(result);
}

export async function submitFabricTransaction(
  transactionName: string,
  ...args: string[]
): Promise<string> {
  const contract = await getFabricContract();

  const result = await contract.submitTransaction(transactionName, ...args);

  return new TextDecoder().decode(result);
}