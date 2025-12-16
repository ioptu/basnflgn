const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const BAS_URL = process.env.BAS_URL;
const LOGIN_USERNAME = process.env.BAS_USERNAME;
const LOGIN_PASSWORD = process.env.BAS_PASSWORD;
if (!BAS_URL || !LOGIN_USERNAME || !LOGIN_PASSWORD) {
    console.error("错误: BAS_URL, BAS_USERNAME, 或 BAS_PASSWORD 环境变量未设置!");
    process.exit(1);
}
//console.log(`[${(new Date).toLocaleTimeString()}] 目标 URL: ${BAS_URL}`);
const SCREENSHOT_WAIT_TIME = 1e4;
const INITIAL_WAIT_TIME = 2 * 60 * 1e3;
const SCREENSHOT_DIR = path.resolve(__dirname, "status_screenshot");
const SELECTOR_USERNAME = "#j_username";
const SELECTOR_SUBMIT_BUTTON = "#logOnFormSubmit";
const SELECTOR_PASSWORD = "#j_password";
const SELECTOR_DISCLAIMER_BUTTON = "#confirm-notification-btn";
async function ensureLoggedIn(page) {
    try {
        let usernameInput = await page.waitForSelector(SELECTOR_USERNAME, {
            timeout: 3e3
        }).catch(() => null);
        if (usernameInput) {
            console.log(`[${(new Date).toLocaleTimeString()}] 检测到登录页面，正在执行自动化登录...`);
            await page.type(SELECTOR_USERNAME, LOGIN_USERNAME, {
                delay: 100
            });
            console.log(`[${(new Date).toLocaleTimeString()}] 点击“继续”...`);
            await Promise.all([ page.waitForSelector(SELECTOR_PASSWORD, {
                timeout: 1e4
            }).catch(() => null), page.click(SELECTOR_SUBMIT_BUTTON) ]);
            let passwordInput = await page.$(SELECTOR_PASSWORD);
            if (passwordInput) {
                console.log(`[${(new Date).toLocaleTimeString()}] 检测到密码输入框，正在输入凭证...`);
                await page.type(SELECTOR_PASSWORD, LOGIN_PASSWORD, {
                    delay: 100
                });
                console.log(`[${(new Date).toLocaleTimeString()}] 点击最终提交按钮完成登录...`);
                await Promise.all([ page.waitForNavigation({
                    waitUntil: "networkidle0"
                }), page.click(SELECTOR_SUBMIT_BUTTON) ]);
                console.log(`[${(new Date).toLocaleTimeString()}] 自动化登录流程成功完成。`);
            } else {
                console.log(`[${(new Date).toLocaleTimeString()}] 警告：未检测到密码输入框。`);
            }
        } else {
            console.log(`[${(new Date).toLocaleTimeString()}] 未检测到登录页面，假设会话有效。`);
        }
    } catch (error) {
        console.error(`[${(new Date).toLocaleTimeString()}] 登录过程中发生错误，可能需要手动干预: ${error.message}`);
    }
}
async function handleDisclaimerPage(page) {
    try {
        console.log(`[${(new Date).toLocaleTimeString()}] 检查说明页面/弹窗...`);
        const okButton = await page.waitForSelector(SELECTOR_DISCLAIMER_BUTTON, {
            timeout: 5e3
        }).catch(() => null);
        if (okButton) {
            console.log(`[${(new Date).toLocaleTimeString()}] 检测到说明页面，准备点击 OK 按钮。`);
            await okButton.click();
            console.log(`[${(new Date).toLocaleTimeString()}] 成功点击 OK 按钮。`);
            await new Promise(resolve => setTimeout(resolve, 1e3));
        } else {
            console.log(`[${(new Date).toLocaleTimeString()}] 未检测到说明页面。`);
        }
    } catch (error) {
        console.error(`[${(new Date).toLocaleTimeString()}] 处理说明页面时发生错误: ${error.message}`);
    }
}
async function runAutomation() {
    let browser;
    try {
        if (!fs.existsSync(SCREENSHOT_DIR)) {
            fs.mkdirSync(SCREENSHOT_DIR);
        }
        browser = await puppeteer.launch({
            args: [ "--no-sandbox", "--disable-setuid-sandbox" ],
            headless: true
        });
        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();
        console.log(`[${(new Date).toLocaleTimeString()}] 浏览器启动成功，正在访问目标 URL...`);
        await page.goto(BAS_URL, {
            waitUntil: "networkidle0"
        });
        await ensureLoggedIn(page);
        await handleDisclaimerPage(page);
        console.log(`[${(new Date).toLocaleTimeString()}] 初始化完成，等待 ${INITIAL_WAIT_TIME / 6e4} 分钟后执行首次稳定状态截图...`);
        await new Promise(resolve => setTimeout(resolve, INITIAL_WAIT_TIME));
        try {
            await new Promise(resolve => setTimeout(resolve, SCREENSHOT_WAIT_TIME));
            await page.screenshot({
                path: path.join(SCREENSHOT_DIR, "latest_bas_status.png"),
                fullPage: true
            });
            console.log(`[${(new Date).toLocaleTimeString()}] 稳定状态截图成功。`);
        } catch (error) {
            console.error(`[${(new Date).toLocaleTimeString()}] 截图失败: ${error.message}`);
        }
        console.log(`[${(new Date).toLocaleTimeString()}] 一次性流程完成，正在关闭浏览器。`);
    } catch (e) {
        console.error(`[${(new Date).toLocaleTimeString()}] 主程序发生致命错误: ${e.message}`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
runAutomation().catch(e => {
    console.error(`[${(new Date).toLocaleTimeString()}] 主程序发生未捕获错误，正在退出: ${e.message}`);
    process.exit(1);
});
