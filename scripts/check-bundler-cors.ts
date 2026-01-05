
const BUNDLER_URL = "https://api.pimlico.io/v1/binance/rpc?apikey=pim_iQCirstXBmWBPpMs9B9MHw";

async function main() {
    console.log("Checking Bundler CORS with Origin: http://localhost:8081");
    
    try {
        const response = await fetch(BUNDLER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Origin": "http://localhost:8081" // Simulate Browser
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_chainId",
                params: [],
                id: 1
            })
        });

        console.log("Status:", response.status);
        console.log("Response:", await response.text());
        
        if (response.ok) {
            console.log("✅ Bundler accessible from localhost:8081");
        } else {
            console.log("❌ Bundler blocked request!");
        }

    } catch (e) {
        console.error("Network Error:", e);
    }
}

main();
