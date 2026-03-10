import { generateCWIF } from "./cryptoUtils.js";  // Generate CIF wallet
import {
    saveWalletToIndexedDB,
    loadWalletFromIndexedDB,
    deleteWalletFromIndexedDB,
} from "./db.js";  


export async function getOrCreateWallet() {
    let wallet = await loadWalletFromIndexedDB();

    if (!wallet) {
        console.log("🔹 No wallet found in IndexedDB. Create a new one...");

        const { cwif, address } = generateCWIF(); 
        wallet = { cwif, address };

        await saveWalletToIndexedDB(wallet);
        console.log("✅ New wallet saved:", wallet.address);
    } else {
        console.log("✅ Wallet loaded:", wallet.address);
    }

    return wallet;
}

export async function resetWallet() {
    await deleteWalletFromIndexedDB();
    localStorage.removeItem("wallet");  // If IndexedDB does not work, also delete LocalStorage
    console.log("✅ Wallet deleted.");
}
