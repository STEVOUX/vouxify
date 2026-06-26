const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const IG_USER = process.env.INSTAGRAM_USERNAME;
const IG_PASS = process.env.INSTAGRAM_PASSWORD;

if (!IG_USER || !IG_PASS) {
  console.error("Missing credentials");
  process.exit(1);
}

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
  const browser = await puppeteer.launch({ 
    headless: false, 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] 
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });
  
  try {
    // Check if cookie consent exists
    const cookieBtn = await page.$('button._a9--._ap36._a9_0');
    if (cookieBtn) await cookieBtn.click();
    
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    await page.type('input[type="text"]', IG_USER, { delay: 30 });
    await page.type('input[type="password"]', IG_PASS, { delay: 30 });
    await page.keyboard.press('Enter');
    
    console.log("Clicked login, waiting...");
    await new Promise(r => setTimeout(r, 8000));
    
    const cookies = await page.cookies();
    const sessionCookie = cookies.find(c => c.name === 'sessionid');
    if (sessionCookie) {
      fs.writeFileSync(path.join(process.cwd(), 'ig_cookies.txt'), formatNetscapeCookies(cookies));
      console.log("Successfully logged in and saved cookies.");
    } else {
      console.log("No sessionid found. Taking screenshot...");
      await page.screenshot({ path: 'ig_error.png' });
    }
  } catch (e) {
    console.error(e);
    await page.screenshot({ path: 'ig_error.png' });
  }
  
  await browser.close();
})();
