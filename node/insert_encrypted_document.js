const { MongoClient, Binary } = require("mongodb");

const { getCredentials } = require("./your_credentials");
credentials = getCredentials();

// start-key-vault
const eDB = "encryption";
const eKV = "__keyVault";
const keyVaultNamespace = `${eDB}.${eKV}`;
// end-key-vault

// start-kmsproviders
const kmsProviders = {
  azure: {
    tenantId: credentials["AZURE_TENANT_ID"],
    clientId: credentials["AZURE_CLIENT_ID"],
    clientSecret: credentials["AZURE_CLIENT_SECRET"],
  },
};
// end-kmsproviders

async function run() {
  // start-schema
  const uri = credentials.MONGODB_URI;
  const unencryptedClient = new MongoClient(uri);
  await unencryptedClient.connect();
  const keyVaultClient = unencryptedClient.db(eDB).collection(eKV);

  const dek1 = await keyVaultClient.findOne({ keyAltNames: "dataKey1" });
  const dek2 = await keyVaultClient.findOne({ keyAltNames: "dataKey2" });
  const dek3 = await keyVaultClient.findOne({ keyAltNames: "dataKey3" });
  const dek4 = await keyVaultClient.findOne({ keyAltNames: "dataKey4" });

  const secretDB = "medicalRecords";
  const secretCollection = "patients";

  const encryptedFieldsMap = {
    [`${secretDB}.${secretCollection}`]: {
      fields: [
        {
          keyId: dek1._id,
          path: "patientId",
          bsonType: "int",
          queries: { queryType: "equality" },
        },
        {
          keyId: dek2._id,
          path: "medications",
          bsonType: "array",
        },
        {
          keyId: dek3._id,
          path: "patientRecord.ssn",
          bsonType: "string",
          queries: { queryType: "equality" },
        },
        {
          keyId: dek4._id,
          path: "patientRecord.billing",
          bsonType: "object",
        },
      ],
    },
  };
  // end-schema

  // start-extra-options
  const extraOptions = {
    cryptSharedLibPath: credentials["SHARED_LIB_PATH"],
  };
  // end-extra-options

  // start-client
  const encryptedClient = new MongoClient(uri, {
    autoEncryption: {
      keyVaultNamespace: keyVaultNamespace,
      kmsProviders: kmsProviders,
      extraOptions: extraOptions,
      encryptedFieldsMap: encryptedFieldsMap,
    },
  });
  await encryptedClient.connect();
  // end-client
  try {
    const unencryptedColl = unencryptedClient
      .db(secretDB)
      .collection(secretCollection);

    // start-insert
    const encryptedColl = encryptedClient
      .db(secretDB)
      .collection(secretCollection);

    let fname = "Jon";
    let lname = "Doe";
    let pid = 12345678;
    let paddr = "157 Electric Ave.";
    let pssn = "987-65-4320";
    let meds = ["Atorvastatin", "Levothyroxine"];

    await encryptedColl.insertOne({
      firstName: fname,
      lastName: lname,
      patientId: pid,
      address: paddr,
      patientRecord: {
        ssn: pssn,
        billing: {
          type: "Visa",
          number: "4111111111111111",
        },
      },
      medications: meds,
    });
    // end-insert
    // start-find
    console.log("Finding a document with regular (non-encrypted) client.");
    console.log(await unencryptedColl.findOne({ firstName: /fname/ }));
    console.log(
      "Finding a document with encrypted client, searching on an encrypted field"
    );
    console.log(
      await encryptedColl.findOne({ "patientRecord.ssn": pssn })
    );
    // end-find
  } finally {
    await unencryptedClient.close();
    await encryptedClient.close();
  }
}

run().catch(console.dir);
