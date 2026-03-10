import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import base58 from "bs58";
import { ripemd160 } from "hash-wasm"; 
import { Buffer } from "buffer";


if (typeof window !== "undefined") {
  window.Buffer = Buffer;
}

const ECPair = ECPairFactory(ecc);

console.log("Is Node.js environment?", typeof process !== "undefined" && process.versions?.node);
console.log("Browser crypto available?", typeof window !== "undefined" && !!window.crypto?.subtle);

const rodNetwork = {
  wif: 0x4E,
  pubKeyHash: 0x3C,
};

//async function sha256(data) {
//  return crypto.createHash('sha256').update(data).digest();
//}

async function sha256(data) {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const input = data instanceof Uint8Array ? data : Uint8Array.from(data);
    const buffer = await window.crypto.subtle.digest("SHA-256", input);
    return Buffer.from(new Uint8Array(buffer));
  } else {
    const { createHash } = await import("crypto");
    return createHash("sha256").update(data).digest();
  }
}


export async function generateCWIF() {
  try {
    const keyPair = ECPair.makeRandom();
    if (!keyPair) throw new Error("❌ ECPair.makeRandom() did not return a key pair.");

    const privateKeyBytes = keyPair.privateKey;

    if (privateKeyBytes.length !== 32) {
      throw new Error(`❌ Invalid Private Key Length: Expected 32 but got ${privateKeyBytes.length}`);
    }

    const networkByte = Buffer.from([rodNetwork.wif]);
    const compressByte = Buffer.from([0x01]);
    const fullKey = Buffer.concat([networkByte, privateKeyBytes, compressByte]);

    const checksum = (await sha256(await sha256(fullKey))).slice(0, 4);
    const cwif = base58.encode(Buffer.concat([fullKey, checksum]));

    if (!cwif || cwif.length < 50) throw new Error("❌ CWIF is invalid!");

    const pubKeyCompressed = keyPair.publicKey;
    const pubKeyHex = Buffer.from(pubKeyCompressed).toString("hex");

    //console.log("🔹 Generated Public Key (JS, corrected):", pubKeyHex);  

    const address = await pubKeyToAddr(pubKeyHex);

    console.log("✅ New ROD address:", address);
    return { cwif, address };
  } catch (error) {
    console.error("❌ Error when generating the CWIF wallet:", error.message);
    return { cwif: null, address: null };
  }
}

export async function pubKeyToAddr(pubKeyHex) {
  const sha256Hash = await sha256(Buffer.from(pubKeyHex, "hex"));
  const ripemd160Bytes = Buffer.from(await ripemd160(sha256Hash), "hex");

  const networkByte = Buffer.from([rodNetwork.pubKeyHash]);
  const addressBytes = Buffer.concat([networkByte, ripemd160Bytes]);

  const checksum = (await sha256(await sha256(addressBytes))).slice(0, 4);
  //console.log("🔹 Checksum (JS, corrected):", checksum.toString("hex")); 

  return base58.encode(Buffer.concat([addressBytes, checksum]));
}

export async function cwifToAddress(cwif) {
  const decoded = base58.decode(cwif);

  if (decoded.length < 38) {
    throw new Error("❌ CWIF is too short!");
  }

  const privateKeyBytes = decoded.slice(1, 33);

  if (privateKeyBytes.length !== 32) {
    throw new Error(`❌ Invalid Private Key Length: Expected 32 but got ${privateKeyBytes.length}`);
  }

  //console.log("🔹 Decoded Private Key (JS, corrected):", privateKeyBytes.toString("hex"));

   const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKeyBytes), { compressed: true });

  const publicKey = Buffer.from(keyPair.publicKey).toString("hex");
  //console.log("🔹 Generated Public Key (JS, corrected):", publicKey);

  return await pubKeyToAddr(publicKey);
}
