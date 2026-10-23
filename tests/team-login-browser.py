"""Check the configured shared worker login against all five selected team contexts."""
import os
import requests
from playwright.sync_api import sync_playwright
API='http://127.0.0.1:8080';SITE='http://127.0.0.1:5500'

def main():
    email=os.environ['TEAM_LOGIN_CHECK_EMAIL'];password=os.environ['TEAM_LOGIN_CHECK_PASSWORD']
    with sync_playwright() as p:
        browser=p.chromium.launch()
        try:
            for n in range(1,6):
                team='Team '+str(n)
                response=requests.post(API+'/api/auth/login',json={'email':email,'password':password,'role':'FIELD_WORKER','team':team},timeout=10)
                response.raise_for_status();session=response.json();assert session['team']==team and session['demo'] is False
                headers={'Authorization':'Bearer '+session['token']}
                me=requests.get(API+'/api/users/me',headers=headers,timeout=10);me.raise_for_status();assert me.json()['team']==team
                tasks=requests.get(API+'/api/tasks?mine=true',headers=headers,timeout=10);tasks.raise_for_status()
                assert all(task['workerId']==session['userId'] for task in tasks.json())
                context=browser.new_context(viewport={'width':1366,'height':768},reduced_motion='reduce');page=context.new_page();errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto(SITE+'/login.html');page.locator('#loginRole').select_option('FIELD_WORKER');page.locator('#loginTeam').select_option(team)
                page.locator('#email').fill(email);page.locator('#password').fill(password);page.locator('#loginButton').click();page.wait_for_url('**/worker/dashboard.html')
                page.wait_for_function("!document.querySelector('#taskList').textContent.includes('Loading tasks')")
                assert team in page.locator('.portal-name').inner_text()
                assert page.evaluate('Auth.getSession().team')==team
                assert page.locator('.demo-badge').is_hidden()
                assert not errors,errors
                print('PASS:',team,'login, signed team context, own task list and portal label',flush=True)
                context.close()
        finally:browser.close()
if __name__=='__main__':main()
