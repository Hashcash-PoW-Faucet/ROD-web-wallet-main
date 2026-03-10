import dotenv from "dotenv";
dotenv.config(); 
import cors from "cors"; 
import express from "express";
import axios from "axios";
import https from "https";
import { generateCWIF } from "./cryptoUtils.js";

const app = express();
const PORT = process.env.PORT || 3001;
const RPC_TLS_STRICT = (process.env.RPC_TLS_STRICT || "true").toLowerCase() === "true";
const MIN_FEE_PER_KB = Number(process.env.MIN_FEE_PER_KB || 0.001);
const DUST_THRESHOLD_SATS = 10000;
const MIN_ABSOLUTE_FEE_SATS = Number(process.env.MIN_ABSOLUTE_FEE_SATS || 20000);

import rateLimit from "express-rate-limit";

app.use(cors()); // Enable CORS for all requests
app.use(express.json());
app.set("trust proxy", 1);

// Middleware for CORS (ensure that all responses contain CORS)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Use "http://localhost:5173" if desired
  // res.header("Access-Control-Allow-Origin", "https://wallet.vecocoin.com"); 
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  //res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 30, // max 30 requests per IP within the time window
  message: { error: "Too many requests. Try again later." }
});

app.post("/generate-wallet", async (req, res) => {
  try {
    const newWallet = await generateCWIF();
    res.json(newWallet);
  } catch (error) {
    res.status(500).json({ error: "Wallet generation failed." });
  }
});


async function rpcRequest(method, params = []) {
  const rpcEndpoints = [
    {
      prefix: process.env.RPC_PREFIX || "http",
      user: process.env.RPC_USER,
      pass: process.env.RPC_PASSWORD,
      host: process.env.RPC_HOST,
      port: process.env.RPC_PORT,
    },
    {
      prefix: process.env.RPC_PREFIX2 || "http",
      user: process.env.RPC_USER2,
      pass: process.env.RPC_PASSWORD2,
      host: process.env.RPC_HOST2,
      port: process.env.RPC_PORT2,
    },
  ];

  const headers = { "content-type": "application/json" };
  const data = { jsonrpc: "2.0", id: 0, method, params };
  const httpsAgent = new https.Agent({
    rejectUnauthorized: RPC_TLS_STRICT,
  });

  for (const ep of rpcEndpoints.filter((ep) => ep.host && ep.port && ep.user && ep.pass)) {
    const url = `${ep.prefix}://${ep.user}:${ep.pass}@${ep.host}:${ep.port}`;
    console.log(`📡 Sending RPC request to ${ep.host}:${ep.port} → ${method} (TLS strict: ${RPC_TLS_STRICT})`);

    try {
      const axiosOptions = { headers };

      if (ep.prefix === "https") {
        axiosOptions.httpsAgent = httpsAgent;
      }

      const response = await axios.post(url, data, axiosOptions);

      if (response.data?.error) {
        const rpcErrorMessage = response.data.error.message || JSON.stringify(response.data.error);
        throw new Error(rpcErrorMessage);
      }

      console.log(`✅ Successful response from ${ep.host}:${ep.port} for ${method}`);
      return response.data.result;
    } catch (error) {
      console.error(`❌ RPC error (${ep.host}:${ep.port}, ${method}):`, error.message);
      if (error.response) {
        console.error(`❌ HTTP status: ${error.response.status}`);
        console.error(`❌ RPC error details:`, error.response.data);
      }
    }
  }

  throw new Error("All RPC endpoints failed");
}

async function getAddressUtxos(address) {
  const scanResult = await rpcRequest("scantxoutset", ["start", [`addr(${address})`]]);

  if (!scanResult || !Array.isArray(scanResult.unspents)) {
    return [];
  }

  return scanResult.unspents.map((utxo) => ({
    txid: utxo.txid,
    vout: utxo.vout,
    outputIndex: utxo.vout,
    scriptPubKey: utxo.scriptPubKey,
    script: utxo.scriptPubKey,
    amount: Number(utxo.amount),
    satoshis: Math.round(Number(utxo.amount) * 1e8),
    height: utxo.height,
    address,
  }));
}

app.post("/validate-address", rateLimiter, async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: "No address provided" });
    }

    const result = await rpcRequest("validateaddress", [address]);

    res.json({ 
      isvalid: result.isvalid,
      address: result.address 
    });
  } catch (error) {
    console.error(`❌ Validate Address Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Create raw transaction (with empirical fee calculation)
app.post("/create-transaction", rateLimiter, async (req, res) => {
    try {
      const { address, targetAddress, amount } = req.body;
      const utxos = await getAddressUtxos(address);
  
      if (!utxos || utxos.length === 0) throw new Error("No UTXOs available for this address.");
  
      let selectedUtxos = [];
      let totalAmount = -100; // small empirical buffer in satoshis
      const amountNeededSats = Math.round(Number(amount) * 1e8);
  
      // Select UTXOs to cover the amount
      for (const utxo of utxos.sort((a, b) => b.satoshis - a.satoshis)) {
        if (utxo.satoshis <= 0) continue;
        selectedUtxos.push(utxo);
        totalAmount += utxo.satoshis;
        if (totalAmount >= amountNeededSats) break;
      }
  
      if (totalAmount < amountNeededSats) throw new Error("Insufficient balance.");
  
      // Fee calculation in satoshis: respect relay floor and avoid float drift
      const estimatedTxSize = 10 + selectedUtxos.length * 148 + 2 * 34; // Estimated size in bytes
      const feeFromRateSats = Math.ceil((estimatedTxSize / 1000) * MIN_FEE_PER_KB * 1e8);
      let feeSats = Math.max(feeFromRateSats, MIN_ABSOLUTE_FEE_SATS);
      let fee = Number((feeSats / 1e8).toFixed(8));

      let changeAmount = totalAmount - amountNeededSats - feeSats;

      // Prevent dust outputs by adding small change to the fee
      if (changeAmount > 0 && changeAmount < DUST_THRESHOLD_SATS) {
        feeSats += changeAmount;
        fee = Number((feeSats / 1e8).toFixed(8));
        changeAmount = 0;
      }

      console.log(`💸 Fee estimate: ${fee} ROD (${feeSats} sats) for ~${estimatedTxSize} bytes`);
  
      const inputs = selectedUtxos.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
      }));
  
      const outputs = {
        [targetAddress]: amount
      };
  
      if (changeAmount > 0) {
        outputs[address] = parseFloat((changeAmount / 1e8).toFixed(8)); // Avoid floating point errors
      }
  
      const rawTx = await rpcRequest("createrawtransaction", [inputs, outputs]);
      res.json({ rawTx });
  
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/sign-transaction", rateLimiter, async (req, res) => {
    try {
      const { rawTx, privateKey, address } = req.body;
      
      // Fetch UTXOs for this address
      const utxos = await getAddressUtxos(address);
      if (!utxos || utxos.length === 0) throw new Error("No UTXOs available");
  
      // Format UTXO details for signing
      const prev_txs = utxos.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        scriptPubKey: utxo.scriptPubKey,
        amount: utxo.amount,
      }));
  
      // Sign with an explicit key instead of wallet state
      const signedTx = await rpcRequest("signrawtransactionwithkey", [rawTx, [privateKey], prev_txs]);

      if (!signedTx || signedTx.complete !== true || !signedTx.hex) {
        throw new Error("Transaction signing failed or returned incomplete result.");
      }
  
      res.json({ signedTx });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  

  app.post("/broadcast-transaction", rateLimiter, async (req, res) => {
    try {
      const { signedTx } = req.body;
  
      if (!signedTx) throw new Error("No signed transaction provided");
  
      console.log(`🚀 Broadcasting TX: ${signedTx}`);  // Debugging output
  
      // Ensure the transaction is a string, not an object
      const txHex = typeof signedTx === "string" ? signedTx : signedTx.hex;
  
      const response = await rpcRequest("sendrawtransaction", [txHex]);

      if (!response || typeof response !== "string") {
        throw new Error("Broadcast failed: node did not return a transaction id.");
      }
  
      res.json({ txid: response });
    } catch (error) {
      console.error(`❌ Broadcast Error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });

// ✅ Check transaction status
app.get("/transaction-status/:txid", rateLimiter, async (req, res) => {
    try {
      const txid = req.params.txid;
      const txInfo = await rpcRequest("getrawtransaction", [txid, true]); // true = decoded
  
      if (!txInfo) {
        return res.status(404).json({ error: "Transaction not found." });
      }
  
      // Extract relevant data
      const confirmations = txInfo.confirmations || 0;
      const isConfirmed = confirmations >= 6;
      const value = txInfo.vout.reduce((acc, vout) => acc + vout.value, 0); // sum of objects
      const blockhash = txInfo.blockhash || "Pending";
      const time = txInfo.time || null;
  
      res.json({
        txid,
        confirmations,
        isConfirmed,
        value,
        blockhash,
        time,
      });
  
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });  

// ✅ Get balance of a given address using UTXOs
app.get("/get-balance/:address", rateLimiter, async (req, res) => {
  try {
      const address = req.params.address;
      console.log(`🔍 Request for balance of ${address}`);

      let utxos;
      
      try {
          utxos = await getAddressUtxos(address);
      } catch (rpcError) {
          console.log(`🟡 UTXO scan failed or returned no data for ${address}. Return: 0 ROD`);
          return res.json({ balance: 0 });
      }

      if (!utxos || !Array.isArray(utxos) || utxos.length === 0) {
          console.log(`🟡 No UTXOs found for ${address}. Return: 0 ROD`);
          return res.json({ balance: 0 }); 
      }

      // Calculate balance (sum of UTXO values)
      const totalBalance = utxos.reduce((sum, utxo) => sum + utxo.amount, 0);
      console.log(`💰 Balance for ${address}: ${totalBalance} ROD`);
      
      res.json({ balance: totalBalance });

  } catch (error) {
      console.error("❌ Balance API Error:", error.message);
      res.status(500).json({ error: "Error when retrieving the balance." });
  }
});

app.get('/status', async (req, res) => {
  try {
    const result = await rpcRequest('getblockchaininfo');
    if (result && result.blocks) {
      res.json({ status: 'ok', blocks: result.blocks });
    } else {
      res.json({ status: 'error' });
    }
  } catch (err) {
    res.json({ status: 'error' });
  }
});

// 🛠 **Catch all other non-defined routes**
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ ROD Backend running on port ${PORT}`);
});
