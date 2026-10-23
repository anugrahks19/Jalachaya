"""Check auth screen fit, real registration, and pond browsing within the citizen portal."""
import os
from pathlib import Path
import secrets
import subprocess
import requests
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SITE = "http://127.0.0.1:5500"
API = "http://127.0.0.1:8080"

def fits(page):
    metrics = page.evaluate("({h:innerHeight, sh:document.documentElement.scrollHeight, w:innerWidth, sw:document.documentElement.scrollWidth})")
    assert metrics['sh'] <= metrics['h'] and metrics['sw'] <= metrics['w'], metrics
    assert page.locator('body > .page-strip').is_visible(), 'Pond footer must remain visible'
    if metrics['w'] > 860:
        illustration = page.locator('.auth-aside').bounding_box()
        form = page.locator('.auth-card').bounding_box()
        assert abs(illustration['height'] - form['height']) < 1, (illustration, form)
        assert abs(illustration['y'] - form['y']) < 1, (illustration, form)

def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for width, height in [(1920,900), (1366,768), (1280,720), (390,844), (360,640), (320,568)]:
                page = browser.new_page(viewport={"width": width, "height": height}, reduced_motion="reduce")
                page.goto(SITE + "/login.html?loggedOut=1")
                page.locator('#judgeAccountButtons button').nth(2).wait_for()
                fits(page)
                page.goto(SITE + "/register.html")
                fits(page)
                page.locator('#name').fill('Screen Fit Citizen')
                page.locator('#email').fill('screen-fit@test.invalid')
                page.locator('#registerNextButton').click()
                page.locator('#password').wait_for(state='visible')
                fits(page)
                page.locator('#registerBackButton').click()
                assert page.locator('#name').input_value() == 'Screen Fit Citizen'
                assert page.locator('#email').input_value() == 'screen-fit@test.invalid'
                page.close()
            print('PASS: login and both registration steps fit six desktop/phone sizes without page scrolling')
            page = browser.new_page(viewport={"width":1366,"height":768})
            page.goto(SITE + '/login.html')
            page.get_by_role('button', name='Citizen', exact=True).click()
            page.locator('#loginButton').click()
            page.wait_for_url('**/citizen/dashboard.html')
            page.get_by_role('link', name='Public pond status', exact=True).click()
            page.wait_for_url('**/citizen/ponds.html')
            page.locator('#citizenPondRows [data-pond-id]').first.wait_for()
            token = page.evaluate('Auth.getToken()')
            expected = requests.get(API + '/api/public/ponds', headers={'Authorization':'Bearer '+token}, timeout=10).json()
            assert int(page.locator('#pondCount').inner_text()) == len(expected)
            page.get_by_role('button', name='View details').first.click()
            page.locator('#pondStatusBody').get_by_role('heading', name='Complaint timeline').wait_for()
            assert '/citizen/ponds.html' in page.url
            assert page.locator('.sidebar').is_visible()
            assert page.locator('#pondStatusBody a').get_attribute('href').startswith('report.html?pond=')
            page.locator('#pondStatusDialog').get_by_role('button', name='Close', exact=True).click()
            for width in (390, 768):
                page.set_viewport_size({"width":width,"height":900})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.close()
            print('PASS: citizen pond list and detail dialog stay within the dashboard and use live API data')
            register_and_cleanup(browser)
        finally:
            browser.close()

def register_and_cleanup(browser):
    email = 'wizard-' + secrets.token_hex(10) + '@local-check.invalid'
    password = secrets.token_urlsafe(24)
    page = browser.new_page()
    try:
        page.goto(SITE + '/register.html')
        page.locator('#registerNextButton').click()
        page.get_by_text('Please enter your full name.', exact=True).wait_for()
        page.locator('#name').fill('Temporary Wizard Check')
        page.locator('#email').fill(email)
        page.locator('#phone').fill('9876543210')
        page.locator('#ward').select_option('Ward 2')
        page.locator('#registerNextButton').click()
        page.locator('#password').fill(password)
        page.locator('#confirmPassword').fill(password + 'different')
        page.locator('#registerButton').click()
        page.get_by_text('Passwords do not match.', exact=True).wait_for()
        page.locator('#confirmPassword').fill(password)
        with page.expect_response(lambda response: response.url.endswith('/api/auth/register') and response.request.method == 'POST') as response:
            page.locator('#registerButton').click()
        assert response.value.status == 200
        page.wait_for_url('**/citizen/dashboard.html?welcome=1')
        print('PASS: step validation, password mismatch, and successful two-step registration against Java/MySQL')
    finally:
        page.close()
        env = {**os.environ, 'MYSQL_PWD': os.environ['DB_PASSWORD']}
        sql = "START TRANSACTION; DELETE FROM app_users WHERE email = '" + email + "'; COMMIT;"
        result = subprocess.run([os.environ['MYSQL_CLIENT_PATH'], '-h','127.0.0.1','-u','jalachaya','--ssl-mode=REQUIRED','-D','jalachaya'], input=sql,
                                text=True, capture_output=True, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
        assert result.returncode == 0, 'Temporary registration cleanup failed'

if __name__ == '__main__': main()
