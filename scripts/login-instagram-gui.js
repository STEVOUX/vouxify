const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

function formatNetscapeCookies(cookies) {
  let out = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This is a generated file!  Do not edit.\n\n";
  for (const c of cookies) {
    const domain = c.domain.startsWith('.') ? c.domain : `.${c.domain}`;
    const flag = c.domain.startsWith('.') ? "TRUE" : "FALSE";
    out += `${domain}\t${flag}\t${c.path}\t${c.secure ? "TRUE" : "FALSE"}\t${Math.floor(c.expires) || 0}\t${c.name}\t${c.value}\n`;
  }
  return out;
}

(async () => {
  console.log("=================================================");
  console.log("Opening Chrome window for Instagram Login...");
  console.log("Please log in. This window will automatically close");
  console.log("and save your session once you are authenticated!");
  console.log("=================================================");
  
  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
  
  // Wait in a loop until we detect the sessionid cookie
  const checkInterval = setInterval(async () => {
    try {
      if (browser.isConnected()) {
        const client = await page.target().createCDPSession();
        const { cookies } = await client.send('Network.getAllCookies');
        const session = cookies.find(c => c.name === 'sessionid');
        if (session) {
          clearInterval(checkInterval);
          console.log("\n✅ SUCCESS! Login detected!");
          console.log("Saving your secure session to ig_cookies.txt...");
          
          const cookieString = formatNetscapeCookies(cookies);
          fs.writeFileSync(path.join(process.cwd(), 'ig_cookies.txt'), cookieString);
          
          console.log("✅ Cookies saved successfully! You can now download stories!");
          await browser.close();
          process.exit(0);
        }
      } else {
        clearInterval(checkInterval);
        console.log("Browser was closed before login could be completed.");
        process.exit(1);
      }
    } catch (e) {
      // ignore
    }
  }, 1500);
})();
