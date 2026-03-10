import axios from "axios";
import dotenv from "dotenv";
dotenv.config(); 

const url = `${process.env.PREFIX}://${process.env.RPC_USER}:${process.env.RPC_PASSWORD}@${process.env.RPC_HOST}:${process.env.RPC_PORT}`;

async function testRPC() {
    console.log(`🔍 Testing RPC connection to: ${url}`);

    try {
        const response = await axios.post(url, {
            jsonrpc: "2.0",
            id: 1,
            method: "getblockcount",
            params: []
        }, { headers: { "Content-Type": "application/json" } });

        console.log("✅ RPC Response:", response.data);
    } catch (error) {
        console.error("❌ RPC Connection failed:", error.message);
        if (error.response) {
            console.error("❌ HTTP Status:", error.response.status);
            console.error("❌ Response Data:", error.response.data);
        }
    }
}

testRPC();
