const DB_NAME = "rod_wallet";
const WALLET_STORE = "wallet_store";
const ADDRESS_STORE = "address_book";
const DB_VERSION = 3; 


async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function (event) {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(WALLET_STORE)) {
                db.createObjectStore(WALLET_STORE, { keyPath: "id" });
                console.log("✅ 'wallet_store' created");
            }

            if (!db.objectStoreNames.contains(ADDRESS_STORE)) {
                db.createObjectStore(ADDRESS_STORE, { keyPath: "id" });
                console.log("✅ 'address_book' created");
            }
        };

        request.onsuccess = function (event) {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error("❌ IndexedDB error:", event.target.error);
            reject("❌ IndexedDB could not be opened.");
        };
    });
}

export async function saveWalletToIndexedDB(encryptedWallet) {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(WALLET_STORE, "readwrite");
            const store = transaction.objectStore(WALLET_STORE);
            store.put({ id: "main_wallet", data: encryptedWallet });

            transaction.oncomplete = () => resolve("✅ Wallet saved.");
            transaction.onerror = (event) => reject("❌ Error while saving wallet: " + event.target.error);
        });
    } catch (error) {
        console.error(error);
    }
}

export async function loadWalletFromIndexedDB() {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(WALLET_STORE, "readonly");
            const store = transaction.objectStore(WALLET_STORE);
            const getRequest = store.get("main_wallet");

            getRequest.onsuccess = function () {
                resolve(getRequest.result ? getRequest.result.data : null);
            };

            getRequest.onerror = (event) => reject("❌ Error while loading wallet: " + event.target.error);
        });
    } catch (error) {
        console.error(error);
    }
}


export const loadWalletSafely = async () => {
    try {
        const encryptedWallet = await loadWalletFromIndexedDB();
        if (encryptedWallet) {
            console.log("✅ Wallet loaded from IndexedDB.");
            return encryptedWallet;
        }
        console.warn("⚠ No wallet found in IndexedDB, try LocalStorage...");
    } catch (error) {
        console.error("❌ Error loading from IndexedDB:", error);
    }

    // Fallback to LocalStorage
    const localWallet = localStorage.getItem("wallet");
    if (localWallet) {
        console.log("✅ Wallet loaded from LocalStorage.");
        return localWallet;
    }

    console.warn("⚠ No wallet found.");
    return null;
};


export const saveWalletSafely = async (encryptedWallet) => {
    try {
        await saveWalletToIndexedDB(encryptedWallet);
        console.log("✅ Wallet successfully stored in IndexedDB.");
    } catch (error) {
        console.error("❌ Error savaing in IndexedDB:", error);
        console.warn("⚠ Saving wallet in LocalStorage instead...");
        localStorage.setItem("wallet", encryptedWallet);
    }
};

export const deleteWalletSafely = async () => {
    try {
        await deleteWalletFromIndexedDB();
        console.log("✅ Wallet successfully deleted from IndexedDB.");
    } catch (error) {
        console.error("❌ Error when deleting from IndexedDB:", error);
    }

    // Fallback to LocalStorage
    localStorage.removeItem("wallet");
    console.log("✅ Wallet successfully deleted from LocalStorage.");
};

export async function deleteWalletFromIndexedDB() {
    try {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(WALLET_STORE, "readwrite");
  
        transaction.oncomplete = () => {
          console.log("✅ Transaction completed.");
        };
  
        transaction.onerror = (event) => {
          console.error("❌ Transaction error:", event.target.error);
          reject("❌ Transaction error: " + event.target.error);
        };
  
        const store = transaction.objectStore(WALLET_STORE);
        const deleteRequest = store.delete("main_wallet");
  
        deleteRequest.onsuccess = () => {
          console.log("✅ Delete request successful.");
          resolve("✅ Wallet deleted.");
        };
  
        deleteRequest.onerror = (event) => {
          console.error("❌ Delete request error:", event.target.error);
          reject("❌ Error during deletion: " + event.target.error);
        };
      });
    } catch (error) {
      console.error("❌ Exception in deleteWalletFromIndexedDB:", error);
    }
  }


export async function saveAddressToIndexedDB(nickname, address) {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(ADDRESS_STORE, "readwrite");
            const store = transaction.objectStore(ADDRESS_STORE);
            store.put({ id: nickname, address });

            transaction.oncomplete = () => resolve("✅ Address saved.");
            transaction.onerror = (event) => reject("❌ Error during saving: " + event.target.error);
        });
    } catch (error) {
        console.error(error);
    }
}

export async function loadAddressBookFromIndexedDB() {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(ADDRESS_STORE, "readonly");
            const store = transaction.objectStore(ADDRESS_STORE);
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = function () {
                const addressBook = {};
                getAllRequest.result.forEach(entry => {
                    addressBook[entry.id] = entry.address;
                });
                resolve(addressBook);
            };

            getAllRequest.onerror = (event) => reject("❌ Error during loading: " + event.target.error);
        });
    } catch (error) {
        console.error(error);
    }
}

export async function deleteAddressFromIndexedDB(nickname) {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(ADDRESS_STORE, "readwrite");
            const store = transaction.objectStore(ADDRESS_STORE);
            const deleteRequest = store.delete(nickname);

            deleteRequest.onsuccess = () => resolve("✅ Address deleted.");
            deleteRequest.onerror = (event) => reject("❌ Error while deleting: " + event.target.error);
        });
    } catch (error) {
        console.error(error);
    }
}

export const loadAddressBookSafely = async () => {
    try {
        const addressBook = await loadAddressBookFromIndexedDB();
        if (Object.keys(addressBook).length > 0) {
            console.log("✅ Address book loaded from IndexedDB.");
            return addressBook;
        }
        console.warn("⚠ No address book found in IndexedDB, try LocalStorage...");
    } catch (error) {
        console.error("❌ Error loading from IndexedDB:", error);
    }

    const localBook = localStorage.getItem("address_book");
    if (localBook) {
        console.log("✅ Address book loaded from LocalStorage.");
        return JSON.parse(localBook);
    }

    console.warn("⚠ No address book found.");
    return {};
};

export const deleteAddressSafely = async (nickname) => {
    try {
        await deleteAddressFromIndexedDB(nickname);
        console.log(`✅ Adresse "${nickname}" erfolgreich aus IndexedDB gelöscht.`);
    } catch (error) {
        console.error("❌ Error when deleting from IndexedDB:", error);
    }

    // Fallback to LocalStorage
    const addressBook = JSON.parse(localStorage.getItem("address_book")) || {};
    delete addressBook[nickname];
    localStorage.setItem("address_book", JSON.stringify(addressBook));
    console.log(`✅ Address ‘${nickname}’ successfully deleted from LocalStorage.`);
};

export const saveAddressSafely = async (nickname, address) => {
    try {
        await saveAddressToIndexedDB(nickname, address);
        console.log(`✅ Address ‘${nickname}’ successfully saved in IndexedDB.`);
    } catch (error) {
        console.error("❌ Error when saving in IndexedDB:", error);
        console.warn("⚠ Save address in LocalStorage instead...");

        // Fallback to LocalStorage
        const addressBook = JSON.parse(localStorage.getItem("address_book")) || {};
        addressBook[nickname] = address;
        localStorage.setItem("address_book", JSON.stringify(addressBook));

        console.log(`✅ Address ‘${nickname}’ successfully saved in LocalStorage.`);
    }
};


export async function deleteAddressBookFromIndexedDB() {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(ADDRESS_STORE, "readwrite");
            const store = transaction.objectStore(ADDRESS_STORE);
            const deleteRequest = store.clear(); 

            deleteRequest.onsuccess = () => resolve("✅ Address book deleted.");
            deleteRequest.onerror = (event) => reject("❌ Error while deleting address book: " + event.target.error);
        });
    } catch (error) {
        console.error(error);
    }
}

