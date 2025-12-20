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
const SELECTOR_THEIA_MAIN = "iframe#theia-main";

async function ensureLoggedIn(page) {
    try {
        let usernameInput = await page.waitForSelector(SELECTOR_USERNAME, { timeout: 5000 }).catch(() => null);
        if (usernameInput) {
            console.log(`[${(new Date).toLocaleTimeString()}] 执行登录...`);
            await page.type(SELECTOR_USERNAME, LOGIN_USERNAME, { delay: 100 });
            await Promise.all([ 
                page.waitForSelector(SELECTOR_PASSWORD, { timeout: 15000 }).catch(() => null), 
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
        const okButton = await page.waitForSelector(SELECTOR_DISCLAIMER_BUTTON, { timeout: 8000 }).catch(() => null);
        if (okButton) {
            await okButton.click();
            console.log(`[${(new Date).toLocaleTimeString()}] 已点击说明页 OK。`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    } catch (e) {}
}

async function runAutomation() {
    let browser;
    try {
        if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);
        browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"], headless: true });
        const page = (await browser.pages())[0] || await browser.newPage();
        
        
        //page.setDefaultTimeout(900000); 

        console.log(`[${(new Date).toLocaleTimeString()}] 正在访问 BAS 主页...`);
        await page.goto(BAS_URL, { waitUntil: "networkidle0" });
        
        await ensureLoggedIn(page);
        await handleDisclaimerPage(page);

        
        try {
            const frameHandle = await page.waitForSelector('iframe#loading-ui', { timeout: 30000 }).catch(() => null);
            if (frameHandle) {
                const frame = await frameHandle.contentFrame();
                const startBtn = await frame.waitForSelector('#bDelete', { timeout: 10000 }).catch(() => null);
                if (startBtn) {
                    await startBtn.click();
                    console.log(`[${(new Date).toLocaleTimeString()}] 检测到停止状态，已点击 Start。`);
                }
            }
        } catch (e) { console.log("未发现启动按钮。"); }

        // --- 循环重试检测逻辑 ---
        console.log(`[${(new Date).toLocaleTimeString()}] 开始检测页面加载状态...`);
        
        let theiaFrame = null;
        const RETRY_LIMIT = 6; // 最多 6 轮循环
        const TWO_MINUTES = 1 * 60 * 1000; // 每轮等待 1 分钟

        // 先进行初始检测 (默认等 1 分钟)
        theiaFrame = await page.waitForSelector(SELECTOR_THEIA_MAIN, { visible: true, timeout: TWO_MINUTES }).catch(() => null);

        // 如果第一轮没等到，进入循环
        for (let i = 1; i <= RETRY_LIMIT && !theiaFrame; i++) {
            console.warn(`[${(new Date).toLocaleTimeString()}] 第 ${i} 次检测：未发现页面，继续等待 1 分钟...`);
            
            // 每次等待前可以做一点点交互（比如刷新/滚动）防止连接彻底死掉
            await page.evaluate(() => window.scrollBy(0, 1)); 
            
            theiaFrame = await page.waitForSelector(SELECTOR_THEIA_MAIN, { visible: true, timeout: TWO_MINUTES }).catch(() => null);
        }

        // --- 最终判定结果 ---
        if (theiaFrame) {
            console.log(`[${(new Date).toLocaleTimeString()}] ✅ 页面已就绪！最后等待 10 秒确保加载完毕。`);
            await new Promise(resolve => setTimeout(resolve, 10000));
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, "latest_bas_status.png"), fullPage: true });
            console.log(`[${(new Date).toLocaleTimeString()}] 任务完成。`);
        } else {
            console.error(`[${(new Date).toLocaleTimeString()}] ❌ 报错：经过多轮循环（共计约 8-9 分钟）仍未打开页面。`);
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, "latest_bas_status.png"), fullPage: true });
            // 主动报错，让 GitHub Actions 显示失败
            throw new Error("PAGE_LOAD_TIMEOUT: 多轮尝试后依然无法打开目标页面");
        }

    } catch (e) {
        console.error(`[${(new Date).toLocaleTimeString()}] 致命错误: ${e.message}`);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
    }
}

runAutomation();
