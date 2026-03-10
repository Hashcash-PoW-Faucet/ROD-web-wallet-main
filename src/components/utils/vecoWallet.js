import axios from "axios";
import { generateCWIF, cwifToAddress } from "./cryptoUtils.js";
import CryptoJS from "crypto-js";
import { deleteWalletFromIndexedDB, deleteAddressBookFromIndexedDB, deleteWalletSafely } from "./db"; 

const BACKEND_URL = "http://localhost:3001"
//const BACKEND_URL = "https://wallet.vecocoin.com/api";
//const API_URL = "https://wallet.vecocoin.com/api";
const API_URL = "http://localhost:3001";

export async function getOrCreateWallet() {
    let wallet = localStorage.getItem("wallet");

    if (wallet) {
        wallet = JSON.parse(wallet);
        if (wallet.cwif && wallet.address) {
            console.log("✅ Wallet loaded:", wallet);
            return wallet;
        }
        console.warn("⚠ Saved wallet is invalid. Create a new one...");
    }

    await resetWallet();

    let newWallet = null;
    let tries = 0;

    while (!newWallet || !newWallet.cwif || !newWallet.address) {
        if (tries > 3) {
            console.error("❌ Error: CWIF could not be generated after 3 attempts!");
            return null;
        }
        try {
          const response = await fetch(`${API_URL}/generate-wallet`, {
              method: "POST",
              headers: { "Content-Type": "application/json" }
          });
          newWallet = await response.json();
          console.log("✅ Fetched wallet:", newWallet.address);
      } catch (error) {
          console.error("❌ Fetch error:", error);
      }
        tries++;
    }

    localStorage.setItem("wallet", JSON.stringify(newWallet));
    console.log("✅ New wallet saved:", newWallet.address);
    return newWallet;
}

export async function isValidRODAddress(address) {
  try {
    const response = await axios.post(`${BACKEND_URL}/validate-address`, { address });
    return response.data.isvalid;
  } catch (error) {
    console.error("❌ Error validating the address:", error.message);
    return false;
  }
}

export async function resetWallet() {
    console.log("🔄 Removing wallet");

    localStorage.removeItem("wallet");
    localStorage.removeItem("address_book");

    try {
        await deleteWalletFromIndexedDB();
        await deleteWalletSafely
        await deleteAddressBookFromIndexedDB();
        console.log("✅ IndexedDB data successfully deleted.");
    } catch (error) {
        console.error("❌ Error when deleting from IndexedDB:", error);
    }

    await new Promise((res) => setTimeout(res, 100));
}

export async function importCWIF(cwif_import) {
  try {
    const address_import = await cwifToAddress(cwif_import);
    if (address_import) {
      console.log("✅ Successfully derived ROD address from CWIF:", address_import);
      const newWallet = { cwif: cwif_import, address: address_import };
      // localStorage.setItem("wallet", JSON.stringify(newWallet));
      return newWallet;
    } else {
      console.log("❌ Could not derive ROD wallet from CWIF!");
      return null;
    }
  } catch (error) {
    console.error("❌ Could not generate ROD address. Is the CWIF valid?:", error);
    return null;
  }
}

export async function checkBalance(wallet) {
    try {
        if (!wallet || !wallet.address) throw new Error("Invalid wallet!");
        const response = await axios.get(`${BACKEND_URL}/get-balance/${wallet.address}`);
        return response.data.balance || 0;
    } catch (error) {
        console.error("❌ Error when retrieving ROD balance:", error.message);
        return 0;
    }
}


export async function withdrawFunds(wallet, targetAddress, amount = null) {
    try {
        const balance = await checkBalance(wallet);
        if (balance <= 0) {
            throw new Error("⚠ No credit available for withdrawal.");
        }

        const sendAmount = amount ? Math.min(amount, balance) : balance - 0.00001;

        if (sendAmount <= 0) {
            throw new Error("⚠ Amount too low for a transaction.");
        }

        console.log(`🔹 Processing transfer of ${sendAmount} ROD to ${targetAddress} ...`);

        const { data: rawTxData } = await axios.post(`${BACKEND_URL}/create-transaction`, {
            address: wallet.address,
            targetAddress,
            amount: sendAmount
        });

        if (!rawTxData.rawTx) throw new Error("Error while creating the raw transaction!");

        const { data: signedTxData } = await axios.post(`${BACKEND_URL}/sign-transaction`, {
            rawTx: rawTxData.rawTx,
            privateKey: wallet.cwif,
            address: wallet.address
        });

        if (!signedTxData.signedTx) throw new Error("Error signing the transaction!");

        const { data: broadcastData } = await axios.post(`${BACKEND_URL}/broadcast-transaction`, {
            signedTx: signedTxData.signedTx.hex
        });

        console.log(`✅ Transaction succesfully added to mem poo! TXID: ${broadcastData.txid}`);
        return broadcastData.txid;
    } catch (error) {
        console.error("❌ Fehler bei der Auszahlung:", error.message);
        throw new Error(error.message);
    }
}


// Check status of a transaction**
export async function getTransactionStatus(txid) {
    try {
        const response = await axios.get(`${BACKEND_URL}/transaction-status/${txid}`);
        return response.data;
    } catch (error) {
        console.error("❌ Error when retrieving the transaction status:", error.message);
        return null;
    }
}

// Decrypts wallet using a PIN / password*
export function decryptWallet(encryptedWallet, password) {
    try {
        if (!encryptedWallet) {
            console.error("❌ No encrypted wallet found!");
            return null;
        }

        const decryptedData = CryptoJS.AES.decrypt(encryptedWallet, password).toString(CryptoJS.enc.Utf8);

        if (!decryptedData) {
            console.error("❌ Incorrect password or damaged wallet!");
            return null;
        }

        const wallet = JSON.parse(decryptedData);
        console.log("✅ Wallet successfully decrypted!");
        return wallet;
    } catch (error) {
        console.error("❌ Error when decrypting the wallet:", error.message);
        return null;
    }
}


// Encrypt Wallet with AES-256**
export function encryptWallet(wallet, password) {
    try {
        if (!wallet || !password) {
            console.error("❌ Wallet or password missing!");
            return null;
        }

        const walletString = JSON.stringify(wallet);
        const encryptedWallet = CryptoJS.AES.encrypt(walletString, password).toString();

        console.log("✅ Wallet successfully encrypted.");
        return encryptedWallet;
    } catch (error) {
        console.error("❌ Error when encrypting the wallet:", error.message);
        return null;
    }
}

