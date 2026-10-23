"""Check demo task rendering and keep sample evidence controls out of real sessions."""
import os
import requests
from playwright.sync_api import sync_playwright
API='http://127.0.0.1:8080';SITE='http://127.0.0.1:5500'

def main():
    with sync_playwright() as p:
        browser=p.chromium.launch()
        try:
            for demo,email,password in [(True,'worker@judges.invalid','JudgeWorker123!'),
                    (False,'worker@example.com',os.environ['LOCAL_CHECK_WORKER_PASSWORD'])]:
                response=requests.post(API+'/api/auth/login',json={'email':email,'password':password},timeout=10)
                response.raise_for_status();session=response.json();assert session['demo'] is demo
                tasks=requests.get(API+'/api/tasks?mine=true',headers={'Authorization':'Bearer '+session['token']},timeout=10)
                tasks.raise_for_status();tasks=tasks.json()
                context=browser.new_context();page=context.new_page();errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(SITE+'/login.html');page.evaluate('(s)=>Auth.save(s)',session);page.goto(SITE+'/worker/dashboard.html')
                page.wait_for_function("document.querySelector('#taskList').textContent.indexOf('Loading tasks') === -1")
                assert not errors,errors
                assert all(x.strip()!='-' for x in page.locator('.stat-value').all_text_contents())
                assert page.locator('#useSampleEvidence').count()==1,'Demo-note rendering removed the sample evidence control'
                if demo:
                    assert len(tasks)>=7
                    page.locator('[data-action="complete"]').first.click()
                    helper=page.locator('#useSampleEvidence');helper.wait_for(state='visible');helper.click()
                    page.wait_for_function('pickers.before.getPhotos().length === 1 && pickers.after.getPhotos().length === 1')
                    page.locator('#completionDialog').get_by_role('button',name='Cancel',exact=True).click()
                    page.locator('#taskTabs [data-tab="all"]').click()
                    assert page.locator('#taskList .task-card').count()==len(tasks)
                    print('PASS: demo worker renders all '+str(len(tasks))+' tasks, counts, tabs and sample evidence pickers',flush=True)
                else:
                    assert all('JUDGES DEMO' not in str(task) for task in tasks)
                    page.evaluate('UI.openDialog("completionDialog")')
                    assert page.locator('#useSampleEvidence').is_hidden()
                    assert page.locator('.demo-badge').is_hidden()
                    print('PASS: real worker dashboard loads without demo records or sample-evidence helper',flush=True)
                assert not errors,errors
                context.close()
        finally:
            browser.close()

if __name__=='__main__':main()
