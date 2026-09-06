/**
 * NexaWork — LiveKit Bridge Controller (Ngrok Pro)
 * Automatically tunnels your local LiveKit server and updates .env.local
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('🚀 Initializing Neural Bridge (Ngrok)...');

// 1. Start Ngrok Tunnel
const ngrokProcess = exec('npx ngrok http 7880 --log=stdout');

console.log('📡 Tunneling LiveKit Server (Port 7880)...');

// 2. Poll Ngrok API to get the public URL
const getNgrokUrl = () => {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.tunnels && json.tunnels.length > 0) {
              const httpsUrl = json.tunnels[0].public_url;
              const wssUrl = httpsUrl.replace('https://', 'wss://');
              clearInterval(interval);
              resolve(wssUrl);
            }
          } catch (e) {
            // Ngrok API not ready yet
          }
        });
      }).on('error', () => {
        // API not up yet
      });
    }, 1000);
  });
};

async function bridge() {
  try {
    const wssUrl = await getNgrokUrl();
    console.log('✅ Bridge Established:', wssUrl);

    // 3. Update .env.local
    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    const updatedContent = envContent.replace(
      /NEXT_PUBLIC_LIVEKIT_URL=.*/,
      `NEXT_PUBLIC_LIVEKIT_URL=${wssUrl}`
    );

    fs.writeFileSync(envPath, updatedContent);
    console.log('📝 .env.local updated with the new tunnel URL.');
    console.log('✨ System is now production-ready via Tunnel.');
    console.log('⚠️  Keep this process running to maintain the bridge.');
    
  } catch (error) {
    console.error('❌ Bridge Failure:', error.message);
  }
}

bridge();

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n🛑 Closing Bridge...');
  ngrokProcess.kill();
  process.exit();
});
