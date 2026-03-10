import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { 
  getOrCreateWallet, checkBalance, withdrawFunds, resetWallet, 
  encryptWallet, decryptWallet, isValidRODAddress, importCWIF
} from "./utils/vecoWallet";
import { 
  loadWalletSafely, saveWalletSafely, loadAddressBookSafely, saveAddressSafely, deleteAddressSafely 
} from "./utils/db";
import "./VecoWallet.css"; 
import StatusLight from './ui/StatusLight';
const MIN_FEE_PER_KB = 0.001;
const MIN_ABSOLUTE_FEE = 0.0002;
const DUST_THRESHOLD = 0.0001;

export default function RODWebWallet() {
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(0);
  const [addressBook, setAddressBook] = useState({});
  const [isWithdrawing, setIsWithdrawing] = useState(false); 
  const [isLoading, setIsLoading] = useState(true);
  const [encryptedWallet, setEncryptedWallet] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function initWallet() {
      setIsLoading(true);
      try {
        const storedWallet = await loadWalletSafely();
        if (storedWallet) {
          console.log("Wallet loaded from IndexedDB/LocalStorage...");
          const unlocked = await unlockWallet(storedWallet);
          if (unlocked) {
            setWallet(unlocked);
          }
        } else {
          const newPin = await askForPin();
          if (!newPin) {
            console.error("❌ No PIN entered. Cancelled!");
            return;
          }
          const newWallet = await getOrCreateWallet();
          const encrypted = await encryptWallet(newWallet, newPin);
          await saveWalletSafely(encrypted);
          setWallet(newWallet);
        }
        const book = await loadAddressBookSafely();
        setAddressBook(book);
      } catch (error) {
        console.error("❌ Error loading the wallet:", error);
      }
      setIsLoading(false);
    }
    initWallet();
  }, []);


  const unlockWallet = async (encrypted) => {
    if (!encrypted) return null;
    const enteredPin = await askForUnlockPin();
    if (!enteredPin) return null;
    try {
      const decryptedWallet = await decryptWallet(encrypted, enteredPin);
      const bal = await checkBalance(decryptedWallet);
      setWallet(decryptedWallet);
      setBalance(bal);
      return decryptedWallet;
    } catch (error) {
      console.error("❌ Error during decryption:", error);
      return null;
    }
  };

  async function askForPin() {
    const { value: pin } = await Swal.fire({
      title: "🔐 Create wallet",
      input: "password",
      inputLabel: "Please create a 4-digit PIN",
      inputPlaceholder: "4-digit PIN",
      inputAttributes: {
        maxlength: 4,
        autocapitalize: "off",
        autocorrect: "off"
      },
      confirmButtonText: "Save",
      showCancelButton: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm-button',
        cancelButton: 'swal-custom-cancel-button'
      },
      inputValidator: (value) => {
        if (!value || value.length !== 4 || isNaN(value)) {
          return "❌ Please enter a valid 4-digit number!";
        }
      }
    });
    return pin;
  }

  async function askForUnlockPin() {
    const { value: pin } = await Swal.fire({
      title: "🔐 Unlock wallet",
      input: "password",
      inputLabel: "Enter your PIN",
      inputPlaceholder: "PIN",
      inputAttributes: {
        maxlength: 4,
        autocapitalize: "off",
        autocorrect: "off"
      },
      confirmButtonText: "Unlock",
      showCancelButton: true,
      allowOutsideClick: false,
      allowEscapeKey: false,
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm-button',
        cancelButton: 'swal-custom-cancel-button'
      },
      inputValidator: (value) => {
        if (!value || value.length !== 4 || isNaN(value)) {
          return "❌ Invalid PIN!";
        }
      }
    });
    return pin;
  }

  const manageAddressBook = async () => {
    const { value: action } = await Swal.fire({
      title: "Manage address book",
      input: "select",
      inputOptions: {
        add: "➕ Add New Address",
        edit: "✏️ Edit Address",
        delete: "🗑 Delete Address"
      },
      showCancelButton: true,
      confirmButtonText: "Select",
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm-button',
        cancelButton: 'swal-custom-cancel-button'
      },
    });
    if (!action) return;
    if (action === "add") {
      await addNewAddress();
    } else if (action === "edit") {
      await editAddress();
    } else if (action === "delete") {
      await deleteAddress();
    }
  };

  const addNewAddress = async () => {
    const { value: newAddress } = await Swal.fire({
      title: "Enter new address",
      input: "text",
      inputPlaceholder: "Enter address here...",
      showCancelButton: true,
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm-button',
        cancelButton: 'swal-custom-cancel-button'
      },
    });
    if (!newAddress || !await isValidRODAddress(newAddress)) {
      return Swal.fire("Error", "Invalid ROD address!", "error");
    }
    const { value: nickname } = await Swal.fire({
      title: "Nickname",
      input: "text",
      inputPlaceholder: "e.g. my MN wallet",
      inputAttributes: { maxlength: 25 },
      showCancelButton: true,
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm-button',
        cancelButton: 'swal-custom-cancel-button'
      },
    });
    if (!nickname) return;
    const updatedBook = { ...addressBook, [nickname]: newAddress };
    await saveAddressSafely(nickname, newAddress);
    setAddressBook(updatedBook);
    Swal.fire("Saved!", `Address "${nickname}" saved.`, "success");
  };

  const editAddress = async () => {
    if (Object.keys(addressBook).length === 0) {
      return Swal.fire("Error", "No addresses available for editing.", "error");
    }
    const formattedOptions = Object.fromEntries(
      Object.entries(addressBook).map(([nickname, address]) => [
        address, 
        `${nickname} (${address.substring(0,6)}...${address.slice(-4)})`
      ])
    );
    const { value: selectedAddress } = await Swal.fire({
      title: "Select an entry to edit.",
      input: "select",
      inputOptions: formattedOptions,
      showCancelButton: true,
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm-button',
        cancelButton: 'swal-custom-cancel-button'
      },
    });
    if (!selectedAddress) return;
    const oldNickname = Object.keys(addressBook).find(nick => addressBook[nick] === selectedAddress);
    if (!oldNickname) return Swal.fire("Error", "Entry not found.", "error");
    const { value: newNickname } = await Swal.fire({
      title: "Edit nickname",
      input: "text",
      inputValue: oldNickname,
      inputAttributes: { maxlength: 25 },
      showCancelButton: true,
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm-button',
        cancelButton: 'swal-custom-cancel-button'
      },
    });
    if (!newNickname) return;
    const { value: newAddress } = await Swal.fire({
      title: "Edit address",
      input: "text",
      inputValue: selectedAddress,
      showCancelButton: true,
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm-button',
        cancelButton: 'swal-custom-cancel-button'
      },
    });
    if (!newAddress || !await isValidRODAddress(newAddress)) {
      return Swal.fire("Error", "Invalid ROD address!", "error");
    }
    const updatedBook = { ...addressBook };
    delete updatedBook[oldNickname];
    updatedBook[newNickname] = newAddress;
    await deleteAddressSafely(oldNickname);
    await saveAddressSafely(newNickname, newAddress);
    setAddressBook(updatedBook);
    Swal.fire("Updated!", "Entry successfully updated.", "success");
  };

  const deleteAddress = async () => {
    if (Object.keys(addressBook).length === 0) {
      return Swal.fire("Error", "No addresses available.", "error");
    }
    const formattedOptions = Object.fromEntries(
      Object.entries(addressBook).map(([nickname, address]) => [
        address, 
        `${nickname} (${address.substring(0,6)}...${address.slice(-4)})`
      ])
    );
    const { value: selectedAddress } = await Swal.fire({
      title: "Select an entry to delete",
      input: "select",
      inputOptions: formattedOptions,
      showCancelButton: true,
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm-button',
        cancelButton: 'swal-custom-cancel-button'
      },
    });
    if (!selectedAddress) return;
    const oldNickname = Object.keys(addressBook).find(nick => addressBook[nick] === selectedAddress);
    if (!oldNickname) return Swal.fire("Error", "Entry not found.", "error");
    const updatedBook = { ...addressBook };
    delete updatedBook[oldNickname];
    await deleteAddressSafely(oldNickname);
    setAddressBook(updatedBook);
    Swal.fire("Deleted!", "Entry deleted.", "success");
  };

    async function askForUnlockPin() {  
      const { value: pin } = await Swal.fire({  
        title: "🔐 Unlock wallet!",  
        input: "password",  
        inputLabel: "Enter your PIN",  
        inputPlaceholder: "PIN",  
        inputAttributes: {  
          maxlength: 4,  
          autocapitalize: "off",  
          autocorrect: "off"  
        },  
        confirmButtonText: "Unlock",  
        showCancelButton: true,
        customClass: {
          popup: 'swal-custom-popup',
          confirmButton: 'swal-custom-confirm-button',
          cancelButton: 'swal-custom-cancel-button'
        },
        inputValidator: (value) => {  
          if (!value || value.length !== 4 || isNaN(value)) {  
            return "❌ Invalid PIN!";  
          }  
        }  
      });  
      return pin;  
    }  
     
    const handleWithdraw = async () => {  
      const addressOptions = Object.keys(addressBook).length > 0 ? 
          Object.fromEntries(Object.entries(addressBook).map(([nickname, address]) => [address, `${nickname} (${address})`])) : 
          { "manual": "🔍 Enter address manually" };
  
      const { value: selectedAddress } = await Swal.fire({
          title: "Pick receipent.",
          input: "select",
          inputOptions: {
              ...addressOptions,
              manual: "🔍 Enter receipient ROD address manually."
          },
          showCancelButton: true,
          confirmButtonText: "Continue",
          customClass: {
            popup: 'swal-custom-popup',
            confirmButton: 'swal-custom-confirm-button',
            cancelButton: 'swal-custom-cancel-button'
          }
      });
  
      if (!selectedAddress) return;
  
      let targetAddress = selectedAddress;
  
      if (selectedAddress === "manual") {
          const { value: manualAddress } = await Swal.fire({
              title: "Enter address",
              input: "text",
              inputPlaceholder: "Enter target address here.",
              showCancelButton: true,
              customClass: {
                popup: 'swal-custom-popup',
                confirmButton: 'swal-custom-confirm-button',
                cancelButton: 'swal-custom-cancel-button'
              },
          });
  
          if (!manualAddress) return;
          targetAddress = manualAddress;
      }
  
      const maxTxAmount = await maxAmount();

      const { value: amount } = await Swal.fire({
          title: "Enter amount",
          html: `
              <input id="swal-input-amount" class="swal2-input" type="number" placeholder="Amount" style="width: 80%; max-width: 250px;">
              <button id="max-btn" class="swal2-confirm swal2-styled" style="margin-top:10px; width: 50%;">MAX</button>
          `,
          showCancelButton: true,
          customClass: {
            popup: 'swal-custom-popup',
            confirmButton: 'swal-custom-confirm-button',
            cancelButton: 'swal-custom-cancel-button'
          },
          didOpen: () => {
              document.getElementById("max-btn").addEventListener("click", () => {
                  document.getElementById("swal-input-amount").value = maxTxAmount;
              });
          },
          preConfirm: () => {
              return document.getElementById("swal-input-amount").value;
          }
      });
  
      if (!amount) return;
  
      if (parseFloat(amount) > maxTxAmount) {
          Swal.fire("Error", "Not enough ROD!", "error");
          return;
      }
  
      if (!await isValidRODAddress(targetAddress)) {
          Swal.fire("Error", "Invalid target address!", "error");
          return;
      }
  
      setIsWithdrawing(true);
      setMessage("⏳  Transaction is being processed...");
  
      try {
          const txid = await withdrawFunds(wallet, targetAddress, parseFloat(amount));
          if (txid) {
              await refreshBalance();
              

              await Swal.fire({
                  title: "✅ Transaction added to mem pool! ",
                  html: `
                      <p>TXID:</p>
                      <p class="swal-text" id="txid-text">${txid}</p>
                      <button id="copy-txid" class="swal2-confirm swal2-styled">📋 Copy</button>
                  `,
                  showConfirmButton: false,
                  customClass: {
                    popup: 'swal-custom-popup'
                  },
                  didOpen: () => {
                      document.getElementById("copy-txid").addEventListener("click", () => {
                          navigator.clipboard.writeText(txid)
                              .then(() => Swal.fire("Copied!", "TXID copied successfully.", "success"))
                              .catch(() => Swal.fire("Fehler", "Error during copying.", "error"));
                      });
                  }
              });
          } else {
              Swal.fire("⚠️ Payment failed.", "Please try again.", "error");
          }
      } catch (error) {
          Swal.fire("❌ Error", `Error message: ${error.message}`, "error");
      }
  
      setIsWithdrawing(false);
  };
    
    const handleExportCWIF = async () => {  
      if (!wallet) {  
        await Swal.fire("Error", "Wallet locked. Please unlock.", "error");  
        return;  
      }  
    
      const enteredPin = await askForUnlockPin();  
      if (!enteredPin) {  
        await Swal.fire("Error", "Export canceled.", "error");  
        return;  
      }
      
      const encrypted = await loadWalletSafely();
      const decryptedWallet = await decryptWallet(encrypted, enteredPin);
      if (!decryptedWallet) {  
        await Swal.fire("Error", "Invalid PIN!", "error");  
        return;  
      }
    
      try {     
        await Swal.fire({  
          title: "Your private key (CWIF)",  
          html: `  
            <p class="font-mono break-words">${wallet.cwif}</p>  
            <button id="copy-cwif" class="mt-2 px-4 py-2 bg-blue-500 text-white rounded">Copy to Clipboard</button>  
          `,  
          showConfirmButton: false,
          customClass: {
            popup: 'swal-custom-popup'
          },  
          didOpen: () => {  
            const copyButton = document.getElementById("copy-cwif");  
            if (copyButton) {  
              copyButton.addEventListener("click", () => {  
                navigator.clipboard.writeText(wallet.cwif)  
                  .then(() => Swal.fire("Copied!", "CWIF copied to clipboard.", "success"))  
                  .catch(() => Swal.fire("Error", "Copy failed.", "error"));  
              });  
            }  
          }  
        });  
    
        setMessage("✅ CWIF exported!");  
      } catch (error) {  
        console.error("❌ Error during CWIF export:", error);  
        await Swal.fire("Error", `Error: ${error.message}`, "error");  
      }  
    };

    const handleImportWallet = async () => {

      const storedWallet = await loadWalletSafely();
      if (storedWallet) {  
        const confirmImport = await Swal.fire({
          title: "⚠️ Import Wallet?",
          text: "Are you sure you want to import a new wallet? This will delete your current wallet. Make sure you have exported your CWIF!",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Yes, import new wallet",
          cancelButtonText: "Cancel",
          customClass: {
            popup: 'swal-custom-popup',
            confirmButton: 'swal-custom-confirm-button',
            cancelButton: 'swal-custom-cancel-button'
          }
        });
        if (!confirmImport.isConfirmed) return;
      
        const pin = await askForUnlockPin();
        if (!pin) {
          await Swal.fire("Error", "No PIN entered.", "error");
          return;
        }

        const encrypted = await loadWalletSafely();
        const decryptedWallet = await decryptWallet(encrypted, pin);
        if (!decryptedWallet) {  
          await Swal.fire("Error", "Invalid PIN!", "error");  
          return;  
        }

      //  await resetWallet();
      }
      
      // Input CWIF as textarea
      const { value: cwif } = await Swal.fire({
        title: "Import Wallet",
        input: "textarea",
        inputLabel: "Enter your CWIF",
        inputPlaceholder: "Paste your CWIF here...",
        showCancelButton: true,
        customClass: {
          popup: 'swal-custom-popup',
          confirmButton: 'swal-custom-confirm-button',
          cancelButton: 'swal-custom-cancel-button'
        },
        inputValidator: (value) => {
          if (!value) {
            return "Please enter your CWIF.";
          }
        }
      });
      if (!cwif) return;
      
      let importedWallet;
      try {
        importedWallet = await importCWIF(cwif);
        if (!importedWallet) {
          throw new Error("CWIF decryption failed.");
        }
      } catch (error) {
        await Swal.fire("Error", "Failed to import wallet: " + error.message, "error");
        return;
      }

      const new_pin = await askForPin();
      if (!new_pin) {
        await Swal.fire("Error", "No PIN entered.", "error");
        return;
      }
     ;
      const encryptedImportedWallet = await encryptWallet(importedWallet, new_pin);
      await resetWallet(); // remove the old wallet files here when everything else worked well.
      await saveWalletSafely(encryptedImportedWallet);
      
      setWallet(importedWallet);
      const newBalance = await checkBalance(importedWallet);
      setBalance(newBalance);
      
      await Swal.fire("Success", "Wallet imported successfully! Address: " + importedWallet.address, "success");
      //window.location.reload();
    };

    const receiveFunds = async () => {
      if (!wallet)
        return Swal.fire("Error", "No wallet loaded!", "error");
    
      await Swal.fire({
        customClass: {
          popup: 'swal-custom-popup'
        },
        title: "Your ROD address",
        html: `
          <div>
            <p class="font-mono break-words text-center" id="wallet-address">${wallet.address}</p>
            <div id="qr-code" class="flex justify-center mt-2"></div>
            <button id="copy-address" class="mt-2 px-4 py-2 bg-green-500 text-white rounded">Copy Address</button>
          </div>
        `,
        didOpen: () => {
          const copyButton = document.getElementById("copy-address");
          if (copyButton) {
            copyButton.addEventListener("click", () => {
              navigator.clipboard.writeText(wallet.address)
                .then(() =>
                  Swal.fire("Copied!", "Wallet address copied.", "success")
                )
                .catch(() =>
                  Swal.fire("Error", "Copy failed.", "error")
                );
            });
          }
        },
        confirmButtonText: "OK"
      });
    };

    const handleResetWallet = async () => {

      const storedWallet = await loadWalletSafely();

      if (storedWallet) {  
        const confirmReset = await Swal.fire({
        title: "⚠️ Reset Wallet?",
        text: "Are you sure? Make sure you have exported your CWIF!",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, delete my current address!",
        cancelButtonText: "No, cancel!",
        customClass: {
          popup: 'swal-custom-popup',
          confirmButton: 'swal-custom-confirm-button',
          cancelButton: 'swal-custom-cancel-button'
        }
        }); 
      
        if (confirmReset.isConfirmed) {
          const enteredPin = await askForUnlockPin();  
          if (!enteredPin) {  
          await Swal.fire("Error", "No PIN enterred.", "error");  
          return;  
          };
          const encrypted = await loadWalletSafely();
          const decryptedWallet = await decryptWallet(encrypted, enteredPin);
          if (!decryptedWallet) {  
            await Swal.fire("Error", "Invalid PIN!", "error");  
            return;  
          }
          await resetWallet();
          await Swal.fire({
            title: "🔄 Wallet reset!",
            text: "Refresh page or import CWIF to generate a new wallet.",
            icon: "success",
            customClass: {
            popup: 'swal-custom-popup',
            confirmButton: 'swal-custom-confirm-button'
            }
          });
          setWallet(null)
          setBalance(0)
          //window.location.reload();
        }
      } else {
        await Swal.fire("Error", "No wallet found!", "error");    
      };  
  };

  const maxAmount = async () => {
    if (!wallet) return 0;

    const bal = await checkBalance(wallet);

    // Mirror backend fee logic conservatively for the MAX button.
    // Assume a typical simple transaction size of ~226 bytes.
    const estimatedTxSize = 10 + 148 + 2 * 34;
    const feeFromRate = (estimatedTxSize / 1000) * MIN_FEE_PER_KB;
    let fee = Math.max(feeFromRate, MIN_ABSOLUTE_FEE);
    fee = Number(fee.toFixed(8));

    let max = Number((bal - fee).toFixed(8));

    // Avoid suggesting a dust remainder for the change output.
    if (max > 0 && bal - max > 0 && bal - max < DUST_THRESHOLD) {
      max = Number((bal - Math.max(fee, DUST_THRESHOLD)).toFixed(8));
    }

    return Math.max(0, max);
  };


  const refreshBalance = async () => {
    if (wallet) {
      const bal = await checkBalance(wallet);
      setBalance(bal);
    }
  }; 

  const formatBalance = (balance) => {
    return balance % 1 === 0 ? balance.toFixed(0) : balance.toFixed(8).replace(/\.?0+$/, '');
  };

  return (
    <div className="wallet-container">
      <h1 className="wallet-title">ROD Web Wallet</h1>
      <StatusLight />
      <div className="wallet-card">
        <div className="balance-container">
          <p className="wallet-balance">{formatBalance(balance) || "Loading..."} ROD</p>
        </div>
      </div>

      <div className="wallet-section">
        <button className="wallet-button" onClick={refreshBalance}>Refresh Balance</button>
        <button className="wallet-button" onClick={receiveFunds}>Receive ROD</button>
        <button className="wallet-button" onClick={handleWithdraw}>Send ROD</button>
        <button className="wallet-button" onClick={manageAddressBook}>Manage Addressbook</button>
        <button className="wallet-button" onClick={handleExportCWIF}>Export Wallet</button>
        <button className="wallet-button" onClick={handleImportWallet}>Import Wallet</button>
        <button className="wallet-button danger" onClick={handleResetWallet}>Reset Wallet</button>
      </div>
      <div className="wallet-footer">
        <p className="wallet-disclaimer">
          It is absolutely crucial to back up your CWIF. If the PIN is forgotten, the local storage (IndexedDB and LocalStorage) must be cleared to reset access. 
          ROD mining rewards require 101 blocks to mature, while normal transactions need 6 confirmations. 
          Attempting to send ROD using UTXOs from immature or unconfirmed blocks will result in an error message. 
          The use of this web wallet is at your own risk. The developers assume no responsibility for any loss of funds, security vulnerabilities, or misuse of the wallet.
        </p>
      </div>
    </div>
  );
}
