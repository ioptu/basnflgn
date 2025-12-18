const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

const BAS_URL = process.env.BAS_URL;
const LOGIN_USERNAME = process.env.BAS_USERNAME;
const LOGIN_PASSWORD = process.env.BAS_PASSWORD;

if (!BAS_URL || !LOGIN_USERNAME || !LOGIN_PASSWORD) {
    console.error("错误: 环境变量未设置!");
    process.exit(1);
}

const SCREENSHOT_DIR = path.resolve(__dirname, "status_screenshot");
const SELECTOR_USERNAME = "#j_username";
const SELECTOR_SUBMIT_BUTTON = "#logOnFormSubmit";
const SELECTOR_PASSWORD = "#j_password";
const SELECTOR_DISCLAIMER_BUTTON = "#confirm-notification-btn";

async function ensureLoggedIn(page) {
    try {
        let usernameInput = await page.waitForSelector(SELECTOR_USERNAME, { timeout: 3e3 }).catch(() => null);
        if (usernameInput) {
            console.log(`[${(new Date).toLocaleTimeString()}] 执行登录...`);
            await page.type(SELECTOR_USERNAME, LOGIN_USERNAME, { delay: 100 });
            await Promise.all([ 
                page.waitForSelector(SELECTOR_PASSWORD, { timeout: 1e4 }).catch(() => null), 
                page.click(SELECTOR_SUBMIT_BUTTON) 
            ]);
            let passwordInput = await page.$(SELECTOR_PASSWORD);
            if (passwordInput) {
                await page.type(SELECTOR_PASSWORD, LOGIN_PASSWORD, { delay: 100 });
                await Promise.all([ 
                    page.waitForNavigation({ waitUntil: "networkidle0" }), 
                    page.click(SELECTOR_SUBMIT_BUTTON) 
                ]);
                console.log(`[${(new Date).toLocaleTimeString()}] 登录成功。`);
            }
        }
    } catch (e) { console.error("登录异常"); }
}

async function handleDisclaimerPage(page) {
    try {
        const okButton = await page.waitForSelector(SELECTOR_DISCLAIMER_BUTTON, { timeout: 5e3 }).catch(() => null);
        if (okButton) {
            await okButton.click();
            console.log(`[${(new Date).toLocaleTimeString()}] 已点击说明页。`);
            await new Promise(resolve => setTimeout(resolve, 2e3));
        }
    } catch (e) {}
}

async function runAutomation() {
    let browser;
    let waitTime = 1 * 60 * 1e3; 
    
    try {
        if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);
        browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"], headless: true });
        const page = (await browser.pages())[0] || await browser.newPage();
        
        console.log(`[${(new Date).toLocaleTimeString()}] 访问 BAS...`);
        await page.goto(BAS_URL, { waitUntil: "networkidle0" });
        
        await ensureLoggedIn(page);
        await handleDisclaimerPage(page);

       
        try {
            const frameHandle = await page.waitForSelector('iframe#loading-ui', { timeout: 8e3 }).catch(() => null);
            if (frameHandle) {
                const frame = await frameHandle.contentFrame();
                const startBtn = await frame.waitForSelector('#bDelete', { timeout: 5e3 }).catch(async () => {
                    return await frame.evaluateHandle(() => {
                        return Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Start'));
                    });
                });

                if (startBtn) {
                    await startBtn.click();
                    console.log(`[${(new Date).toLocaleTimeString()}] 检测到停止状态，已点击 Start。切换为 5 分钟长等待...`);
                    
                    waitTime = 5 * 60 * 1e3; 
                }
            }
        } catch (e) {
            console.log("未发现启动按钮，可能已在运行。使用 1 分钟短等待。");
        }

        console.log(`[${(new Date).toLocaleTimeString()}] 最终等待中 (${waitTime / 6e4} min)...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "latest_bas_status.png"), fullPage: true });
        console.log(`[${(new Date).toLocaleTimeString()}] 流程结束。`);
    } catch (e) {
        console.error(`致命错误: ${e.message}`);
    } finally {
        if (browser) await browser.close();
    }
}

runAutomation().catch(() => process.exit(1));
